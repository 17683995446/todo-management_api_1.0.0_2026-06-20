import { performance } from 'node:perf_hooks'
import type { Logger } from '../../core_layer/logic/logger.js'
import type {
  CycleResult,
  IActor,
  IAgentLoop,
  IAgentOrchestrator,
  IAgentScheduler,
  IDecisionEngine,
  IGoalQueue,
  ILearningEngine,
  IObserver,
  IReflector,
  ISkillRegistry,
  ITaskPlanner,
  IWatchdog,
} from '../agent.interface.js'
import type { ActionResult } from '../model/action_result.js'
import type { Decision } from '../model/decision.js'
import type { CreateGoalInput, Goal } from '../model/goal.js'
import type { SkillContext } from '../model/skill.js'

/**
 * 增强版 Agent 自驱循环
 *
 * 在基础 OODA 循环之上集成五大增强能力：
 *
 * 1. 技能系统：优先使用注册的技能执行行动，扩展 Agent 能力
 * 2. 多 Agent 编排：复杂目标分解后派发给子 Agent 并行执行
 * 3. 长任务规划：将长任务分解为子任务，跟踪进度，支持检查点
 * 4. 学习引擎：从每次反思中提取模式，累积知识，优化决策
 * 5. 永续运行：看门狗监控循环健康，自动恢复故障
 *
 * 增强循环流程：
 *   Observe → [Plan (if complex)] → Decide → [Skill/Orchestrator Act] → Reflect → [Learn] → Update
 *
 * 所有增强组件可选，未提供时退化为基础循环行为。
 */
export class EnhancedAgentLoop implements IAgentLoop {
  private running = false
  private cycleCount = 0

  constructor(
    private readonly logger: Logger,
    private readonly goalQueue: IGoalQueue,
    private readonly observer: IObserver,
    private readonly decisionEngine: IDecisionEngine,
    private readonly actor: IActor,
    private readonly reflector: IReflector,
    private readonly scheduler: IAgentScheduler,
    private readonly skillRegistry?: ISkillRegistry,
    private readonly orchestrator?: IAgentOrchestrator,
    private readonly taskPlanner?: ITaskPlanner,
    private readonly learningEngine?: ILearningEngine,
    private readonly watchdog?: IWatchdog,
  ) {
    // 注册调度器触发回调
    this.scheduler.onTrigger(async () => {
      try {
        await this.runCycle()
      } catch (err) {
        this.logger.error('Cycle failed, watchdog will handle recovery', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    // 配置看门狗健康检查
    if (this.watchdog) {
      this.watchdog.onCheck(async () => {
        // 健康条件：循环正在运行且最近有执行
        return this.running && this.cycleCount > 0
      })
      this.watchdog.onRecover(async () => {
        this.logger.warn('Watchdog triggered recovery, restarting agent loop')
        if (this.running) {
          this.scheduler.stop()
        }
        this.scheduler.start()
      })
    }
  }

  /**
   * 执行一次完整的增强 OODA 循环
   */
  async runCycle(): Promise<CycleResult> {
    const startTime = performance.now()
    this.cycleCount++
    this.logger.info('=== Enhanced agent cycle starting ===', {
      cycle: this.cycleCount,
    })

    try {
      // Step 1: 获取下一个目标（可选）
      const currentGoal = await this.goalQueue.next()
      if (currentGoal) {
        this.logger.info('Goal acquired', {
          goalId: currentGoal.id,
          description: currentGoal.description,
        })
      }

      // Step 2: 长任务规划（如果有目标且规划器可用）
      let plannedTaskCount = 0
      if (currentGoal && this.taskPlanner) {
        const existingTasks = await this.taskPlanner.getTasksByGoal(
          currentGoal.id,
        )
        if (existingTasks.length === 0) {
          // 新目标，进行任务分解
          const tasks = await this.taskPlanner.plan(
            currentGoal.id,
            currentGoal.description,
          )
          plannedTaskCount = tasks.length
          this.logger.info('Goal decomposed into tasks', {
            goalId: currentGoal.id,
            taskCount: plannedTaskCount,
          })
        }
      }

      // Step 3: Observe - 观察系统状态
      const observation = await this.observer.observe()

      // Step 4: Decide - 做出决策
      const decision = await this.decisionEngine.decide(
        observation,
        currentGoal,
      )

      // Step 5: Act - 执行决策（优先使用技能，其次 Actor，可委托子 Agent）
      const actionResult = await this.executeAction(decision, currentGoal)

      // Step 6: Reflect - 反思结果
      const reflection = await this.reflector.reflect(
        actionResult,
        decision,
        observation,
      )

      // Step 7: Learn - 从反思中学习（学习引擎）
      if (this.learningEngine) {
        const learnings = await this.learningEngine.learnFromReflection(
          reflection,
          decision,
        )
        if (learnings.length > 0) {
          this.logger.info('Learnings extracted', { count: learnings.length })
        }
      }

      // Step 8: 将反思生成的新目标添加到队列（自驱闭环）
      await this.addNewGoalsFromReflection(
        reflection.newGoalDescriptions,
        currentGoal,
      )

      // Step 9: 更新目标状态
      if (currentGoal) {
        await this.updateGoalStatus(currentGoal, actionResult, reflection)

        // 更新任务进度（如果使用了任务规划器）
        if (this.taskPlanner && plannedTaskCount > 0) {
          await this.updateTaskProgress(currentGoal.id, actionResult)
        }
      }

      // Step 10: 应用学习到的规则更新（如果学习引擎建议了更新）
      if (this.learningEngine && this.cycleCount % 5 === 0) {
        await this.applyLearnedRules()
      }

      const durationMs = Math.round(performance.now() - startTime)
      const effective = decision.actionType !== 'noop'

      const result: CycleResult = {
        observation,
        decision,
        actionResult,
        reflection,
        effective,
        durationMs,
      }

      this.logger.info('=== Enhanced agent cycle completed ===', {
        cycle: this.cycleCount,
        effective,
        outcome: reflection.outcome,
        newGoals: reflection.newGoalDescriptions.length,
        durationMs,
      })

      return result
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      const errorMsg = err instanceof Error ? err.message : String(err)

      this.logger.error('Enhanced agent cycle failed', {
        cycle: this.cycleCount,
        error: errorMsg,
        durationMs,
      })

      throw err
    }
  }

  /**
   * 启动自动循环（同时启动看门狗）
   */
  start(): void {
    if (this.running) {
      this.logger.warn('Enhanced agent loop already running')
      return
    }

    this.running = true
    this.scheduler.start()
    if (this.watchdog) {
      this.watchdog.start()
    }
    this.logger.info('Enhanced agent loop started', {
      hasSkills: !!this.skillRegistry,
      hasOrchestrator: !!this.orchestrator,
      hasPlanner: !!this.taskPlanner,
      hasLearning: !!this.learningEngine,
      hasWatchdog: !!this.watchdog,
    })
  }

  /**
   * 停止自动循环（同时停止看门狗）
   */
  stop(): void {
    if (!this.running) return

    this.scheduler.stop()
    if (this.watchdog) {
      this.watchdog.stop()
    }
    this.running = false
    this.logger.info('Enhanced agent loop stopped')
  }

  isRunning(): boolean {
    return this.running
  }

  /**
   * 执行行动：优先使用技能，其次委托子 Agent，最后使用 Actor
   */
  private async executeAction(
    decision: Decision,
    goal?: Goal | null,
  ): Promise<ActionResult> {
    const { actionType, actionParams } = decision

    // 尝试 1: 使用技能系统
    if (this.skillRegistry && actionType !== 'noop') {
      const context: SkillContext = {
        goalId: goal?.id,
        params: { ...actionParams, action: actionType },
      }

      const capable = this.skillRegistry.findCapable(context)
      if (capable.length > 0) {
        const skillName = capable[0].name
        this.logger.info('Executing via skill', {
          skill: skillName,
          action: actionType,
        })
        const skillResult = await this.skillRegistry.execute(skillName, context)

        return {
          id: `${Date.now()}-skill`,
          decisionId: decision.id,
          success: skillResult.success,
          output: skillResult.output,
          error: skillResult.error,
          durationMs: skillResult.durationMs,
          timestamp: new Date().toISOString(),
        }
      }
    }

    // 尝试 2: 委托子 Agent（如果编排器可用且有合适的 Agent）
    if (this.orchestrator && actionType !== 'noop') {
      const availableAgent = await this.orchestrator.findAvailable(actionType)
      if (availableAgent) {
        this.logger.info('Delegating to sub-agent', {
          agentId: availableAgent.id,
          agentName: availableAgent.name,
          action: actionType,
        })
        const subResult = await this.orchestrator.executeTask(
          availableAgent.id,
          `task-${Date.now()}`,
          { ...actionParams, action: actionType },
        )

        return {
          id: `${Date.now()}-agent`,
          decisionId: decision.id,
          success: subResult.success,
          output: subResult.output,
          error: subResult.error,
          durationMs: subResult.durationMs,
          timestamp: new Date().toISOString(),
        }
      }
    }

    // 尝试 3: 使用基础 Actor
    return this.actor.act(decision)
  }

  /**
   * 更新任务进度
   */
  private async updateTaskProgress(
    goalId: string,
    actionResult: { success: boolean },
  ): Promise<void> {
    if (!this.taskPlanner) return

    const nextTask = await this.taskPlanner.nextExecutable(goalId)
    if (nextTask) {
      if (actionResult.success) {
        await this.taskPlanner.updateTaskStatus(
          nextTask.id,
          'completed',
          'Completed by agent',
        )
      } else {
        await this.taskPlanner.updateTaskStatus(
          nextTask.id,
          'failed',
          'Action failed',
        )
      }
    }

    const progress = await this.taskPlanner.getProgress(goalId)
    this.logger.info('Task progress updated', {
      goalId,
      completed: progress.completedTasks,
      total: progress.totalTasks,
      rate: `${(progress.completionRate * 100).toFixed(1)}%`,
    })
  }

  /**
   * 应用学习到的规则更新
   */
  private async applyLearnedRules(): Promise<void> {
    if (!this.learningEngine) return

    const ruleUpdates = await this.learningEngine.getRuleUpdates()
    if (ruleUpdates.length === 0) return

    this.logger.info('Applying learned rule updates', {
      count: ruleUpdates.length,
    })

    for (const update of ruleUpdates) {
      // 标记为已应用（实际规则更新逻辑可在决策引擎中实现）
      await this.learningEngine.markApplied(update.id)
      this.logger.info('Rule update applied', {
        id: update.id,
        pattern: update.pattern,
        suggestion: update.suggestedRuleUpdate,
      })
    }
  }

  /**
   * 将反思生成的新目标添加到队列
   */
  private async addNewGoalsFromReflection(
    descriptions: string[],
    sourceGoal?: Goal | null,
  ): Promise<void> {
    for (const description of descriptions) {
      const input: CreateGoalInput = {
        type: this.inferGoalType(description),
        description,
        priority: 'low',
        source: 'reflection',
        maxAttempts: 3,
      }
      await this.goalQueue.add(input)
      this.logger.info('New goal added from reflection', {
        description,
        sourceGoalId: sourceGoal?.id,
      })
    }
  }

  /**
   * 从目标描述推断目标类型
   */
  private inferGoalType(description: string): CreateGoalInput['type'] {
    const lower = description.toLowerCase()
    if (
      lower.includes('fix') ||
      lower.includes('diagnose') ||
      lower.includes('repair')
    ) {
      return 'maintenance'
    }
    if (lower.includes('optimize') || lower.includes('improve')) {
      return 'optimization'
    }
    if (lower.includes('monitor') || lower.includes('track')) {
      return 'monitoring'
    }
    if (lower.includes('retry') || lower.includes('escalate')) {
      return 'self_improvement'
    }
    return 'user_defined'
  }

  /**
   * 根据行动结果和反思更新目标状态
   */
  private async updateGoalStatus(
    goal: Goal,
    actionResult: { success: boolean; error?: string },
    reflection: { outcome: string; learnings: string[] },
  ): Promise<void> {
    if (reflection.outcome === 'success') {
      const resultSummary = reflection.learnings[0] || 'Completed successfully'
      await this.goalQueue.markCompleted(goal.id, resultSummary)
      this.logger.info('Goal completed', { goalId: goal.id })
    } else if (reflection.outcome === 'failure') {
      if (goal.attempts >= goal.maxAttempts) {
        await this.goalQueue.markFailed(
          goal.id,
          `Failed after ${goal.attempts} attempts: ${actionResult.error}`,
        )
        this.logger.warn('Goal failed (max attempts reached)', {
          goalId: goal.id,
          attempts: goal.attempts,
        })
      } else {
        await this.goalQueue.update(goal.id, { status: 'pending' })
        this.logger.info('Goal reset to pending for retry', {
          goalId: goal.id,
          attempts: goal.attempts,
          maxAttempts: goal.maxAttempts,
        })
      }
    } else {
      this.logger.info('Goal partially completed, will retry', {
        goalId: goal.id,
        outcome: reflection.outcome,
      })
    }
  }
}
