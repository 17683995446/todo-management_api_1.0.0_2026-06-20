import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { Logger } from '../../core_layer/logic/logger.js'
import {
  NotFoundError,
  UnsupportedOperationError,
  ValidationError,
} from '../../core_layer/model/errors.js'
import type { IAgentOrchestrator, ISkillRegistry } from '../agent.interface.js'
import type {
  AgentInfo,
  AgentPerformance,
  RegisterAgentInput,
  SubAgentResult,
} from '../model/agent_info.js'
import type { SkillContext } from '../model/skill.js'

/**
 * 多 Agent 编排器
 *
 * 管理子 Agent 的注册、任务分配和执行。
 *
 * 设计原则：
 * - 子 Agent 通过能力（capabilities = 技能名称）匹配任务
 * - 任务分配时 Agent 状态变为 busy，完成后回到 idle
 * - 执行通过 SkillRegistry 查找匹配技能并调用
 * - 自动跟踪每个子 Agent 的性能统计
 * - 支持并行派发多个任务给不同子 Agent
 *
 * 这是 Agent "自主学会操作多个 Agent 完成任务"的核心：
 * 主 Agent 将复杂任务分解后，派发给多个子 Agent 并行执行。
 */
export class AgentOrchestrator implements IAgentOrchestrator {
  /** 子 Agent 注册表（id → AgentInfo） */
  private readonly agents = new Map<string, AgentInfo>()

  constructor(
    private readonly logger: Logger,
    private readonly skillRegistry: ISkillRegistry,
  ) {}

  async registerAgent(input: RegisterAgentInput): Promise<AgentInfo> {
    const now = new Date()
    const agent: AgentInfo = {
      id: randomUUID(),
      name: input.name,
      role: input.role,
      capabilities: input.capabilities,
      status: 'idle',
      performance: {
        tasksCompleted: 0,
        tasksFailed: 0,
        avgTaskDurationMs: 0,
      },
      createdAt: now,
      updatedAt: now,
    }

    this.agents.set(agent.id, agent)
    this.logger.info('Sub-agent registered', {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      capabilities: agent.capabilities,
    })

    return agent
  }

  async unregisterAgent(id: string): Promise<boolean> {
    const agent = this.agents.get(id)
    if (!agent) return false

    this.agents.delete(id)
    this.logger.info('Sub-agent unregistered', { id, name: agent.name })
    return true
  }

  async listAgents(): Promise<AgentInfo[]> {
    return Array.from(this.agents.values())
  }

  async findAvailable(capability: string): Promise<AgentInfo | null> {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle' && agent.capabilities.includes(capability)) {
        return agent
      }
    }
    return null
  }

  async assignTask(agentId: string, taskId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }
    if (agent.status !== 'idle') {
      throw new ValidationError(
        `Agent is not available (status: ${agent.status}): ${agentId}`,
      )
    }

    agent.status = 'busy'
    agent.currentTaskId = taskId
    agent.updatedAt = new Date()
    this.logger.info('Task assigned to sub-agent', {
      agentId,
      agentName: agent.name,
      taskId,
    })
  }

  async executeTask(
    agentId: string,
    taskId: string,
    params: Record<string, unknown>,
  ): Promise<SubAgentResult> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new NotFoundError('Agent', agentId)
    }

    const startTime = performance.now()

    // 确保状态为 busy
    if (agent.status !== 'busy') {
      agent.status = 'busy'
      agent.currentTaskId = taskId
    }

    try {
      // 查找匹配的技能
      const context: SkillContext = {
        goalId: undefined,
        observation: undefined,
        params,
      }

      const capableSkills = this.skillRegistry.findCapable(context)
      if (capableSkills.length === 0) {
        throw new UnsupportedOperationError(
          `No skill available for task params: ${JSON.stringify(params)}`,
        )
      }

      // 优先使用 Agent 能力列表中的技能
      const preferredSkill = capableSkills.find((s) =>
        agent.capabilities.includes(s.name),
      )
      const skillName = preferredSkill?.name ?? capableSkills[0].name

      this.logger.info('Sub-agent executing task', {
        agentId,
        agentName: agent.name,
        taskId,
        skill: skillName,
      })

      const skillResult = await this.skillRegistry.execute(skillName, context)
      const durationMs = Math.round(performance.now() - startTime)

      const result: SubAgentResult = {
        agentId,
        taskId,
        success: skillResult.success,
        output: skillResult.output,
        error: skillResult.error,
        durationMs,
      }

      // 更新性能统计
      this.updatePerformance(agent, result)

      // 恢复状态
      agent.status = 'idle'
      agent.currentTaskId = undefined
      agent.updatedAt = new Date()

      this.logger.info('Sub-agent task completed', {
        agentId,
        taskId,
        success: result.success,
        durationMs,
      })

      return result
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      const errorMsg = err instanceof Error ? err.message : String(err)

      const result: SubAgentResult = {
        agentId,
        taskId,
        success: false,
        output: null,
        error: errorMsg,
        durationMs,
      }

      // 更新性能统计
      this.updatePerformance(agent, result)

      // 恢复状态
      agent.status = 'idle'
      agent.currentTaskId = undefined
      agent.updatedAt = new Date()

      this.logger.error('Sub-agent task failed', {
        agentId,
        taskId,
        error: errorMsg,
        durationMs,
      })

      return result
    }
  }

  async updateAgentStatus(
    id: string,
    status: AgentInfo['status'],
  ): Promise<void> {
    const agent = this.agents.get(id)
    if (!agent) {
      throw new NotFoundError('Agent', id)
    }
    agent.status = status
    agent.updatedAt = new Date()
    this.logger.info('Sub-agent status updated', { id, status })
  }

  async getPerformance(id: string): Promise<AgentPerformance | null> {
    const agent = this.agents.get(id)
    return agent?.performance ?? null
  }

  /**
   * 更新子 Agent 性能统计
   */
  private updatePerformance(agent: AgentInfo, result: SubAgentResult): void {
    const perf = agent.performance
    const totalDuration =
      perf.avgTaskDurationMs * perf.tasksCompleted + result.durationMs

    if (result.success) {
      perf.tasksCompleted++
    } else {
      perf.tasksFailed++
    }
    perf.avgTaskDurationMs = Math.round(
      totalDuration / (perf.tasksCompleted + perf.tasksFailed),
    )
    perf.lastActiveAt = new Date().toISOString()
  }
}
