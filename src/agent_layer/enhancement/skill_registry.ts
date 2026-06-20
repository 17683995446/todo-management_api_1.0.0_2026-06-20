import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { Logger } from '../../core_layer/logic/logger.js'
import {
  AlreadyExistsError,
  NotFoundError,
  ValidationError,
} from '../../core_layer/model/errors.js'
import type { ISkillRegistry } from '../agent.interface.js'
import type {
  RegisterSkillInput,
  Skill,
  SkillContext,
  SkillHandler,
  SkillResult,
  SkillStats,
} from '../model/skill.js'

/**
 * 技能注册表
 *
 * 管理可插拔技能的注册、查询、执行和统计。
 *
 * 设计原则：
 * - 技能元数据和处理器分离：元数据可序列化，处理器是代码
 * - 技能通过 canHandle 判断适用性，支持智能调度
 * - 每次执行自动更新统计（次数、成功率、平均耗时）
 * - 技能可被启用/禁用，禁用的技能不会被 findCapable 返回
 *
 * 这是 Agent "自主学会增强自己的技能"的基础设施：
 * Agent 可以在运行时注册新技能，扩展自身能力。
 */
export class SkillRegistry implements ISkillRegistry {
  /** 技能元数据表（name → Skill） */
  private readonly skills = new Map<string, Skill>()
  /** 技能处理器表（name → SkillHandler） */
  private readonly handlers = new Map<string, SkillHandler>()

  constructor(private readonly logger: Logger) {}

  async register(input: RegisterSkillInput): Promise<Skill> {
    if (this.skills.has(input.name)) {
      throw new AlreadyExistsError('Skill', input.name)
    }

    const now = new Date()
    const skill: Skill = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      category: input.category,
      version: input.version ?? '1.0.0',
      enabled: true,
      stats: {
        timesUsed: 0,
        successCount: 0,
        failureCount: 0,
        avgDurationMs: 0,
      },
      createdAt: now,
      updatedAt: now,
    }

    this.skills.set(input.name, skill)
    this.handlers.set(input.name, input.handler)

    this.logger.info('Skill registered', {
      name: input.name,
      category: input.category,
      version: skill.version,
    })

    return skill
  }

  async unregister(name: string): Promise<boolean> {
    const existed = this.skills.delete(name)
    this.handlers.delete(name)
    if (existed) {
      this.logger.info('Skill unregistered', { name })
    }
    return existed
  }

  async setEnabled(name: string, enabled: boolean): Promise<Skill> {
    const skill = this.skills.get(name)
    if (!skill) {
      throw new NotFoundError('Skill', name)
    }
    skill.enabled = enabled
    skill.updatedAt = new Date()
    this.logger.info('Skill toggled', { name, enabled })
    return skill
  }

  get(name: string): Skill | null {
    return this.skills.get(name) ?? null
  }

  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  findCapable(context: SkillContext): Skill[] {
    const capable: Skill[] = []
    for (const [name, skill] of this.skills) {
      if (!skill.enabled) continue
      const handler = this.handlers.get(name)
      if (handler?.canHandle(context)) {
        capable.push(skill)
      }
    }
    return capable
  }

  async execute(name: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(name)
    if (!skill) {
      throw new NotFoundError('Skill', name)
    }
    if (!skill.enabled) {
      throw new ValidationError(`Skill is disabled: ${name}`)
    }

    const handler = this.handlers.get(name)
    if (!handler) {
      throw new ValidationError(`Skill handler missing: ${name}`)
    }

    const startTime = performance.now()
    let result: SkillResult

    try {
      result = await handler.execute(context)
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      result = {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      }
    }

    // 确保耗时已计算
    if (result.durationMs === 0) {
      result.durationMs = Math.round(performance.now() - startTime)
    }

    await this.recordUsage(name, result)
    return result
  }

  async recordUsage(name: string, result: SkillResult): Promise<void> {
    const skill = this.skills.get(name)
    if (!skill) return

    const stats: SkillStats = skill.stats
    const totalDuration =
      stats.avgDurationMs * stats.timesUsed + result.durationMs
    stats.timesUsed++
    stats.avgDurationMs = Math.round(totalDuration / stats.timesUsed)
    stats.lastUsedAt = new Date().toISOString()

    if (result.success) {
      stats.successCount++
    } else {
      stats.failureCount++
    }

    skill.updatedAt = new Date()
  }
}
