import { performance } from 'node:perf_hooks'
import type { Logger } from '../../core_layer/logic/logger.js'
import type {
  CycleResult,
  IActor,
  IAgentLoop,
  IAgentScheduler,
  IDecisionEngine,
  IGoalQueue,
  IObserver,
  IReflector,
} from '../agent.interface.js'
import type { CreateGoalInput, Goal } from '../model/goal.js'

/**
 * Agent 自驱循环
 *
 * 编排完整的 OODA 循环：
 *   Observe → Decide → Act → Reflect
 *
 * 每次循环：
 * 1. 从目标队列获取下一个目标（可选）
 * 2. 观察系统状态
 * 3. 基于观察和目标做出决策
 * 4. 执行决策
 * 5. 反思结果，提取经验，生成新目标
 * 6. 将新目标添加到队列（自驱闭环）
 * 7. 更新目标状态
 *
 * 循环由调度器定时触发，无需人工干预。
 */
export class AgentLoop implements IAgentLoop {
  private running = false

  constructor(
    private readonly logger: Logger,
    private readonly goalQueue: IGoalQueue,
    private readonly observer: IObserver,
    private readonly decisionEngine: IDecisionEngine,
    private readonly actor: IActor,
    private readonly reflector: IReflector,
    private readonly scheduler: IAgentScheduler,
  ) {
    // 注册调度器触发回调
    this.scheduler.onTrigger(async () => {
      await this.runCycle()
    })
  }

  /**
   * 执行一次完整的 OODA 循环
   */
  async runCycle(): Promise<CycleResult> {
    const startTime = performance.now()
    this.logger.info('=== Agent cycle starting ===', {})

    try {
      // Step 1: 获取下一个目标（可选）
      const currentGoal = await this.goalQueue.next()
      if (currentGoal) {
        this.logger.info('Goal acquired for this cycle', {
          goalId: currentGoal.id,
          description: currentGoal.description,
        })
      }

      // Step 2: Observe - 观察系统状态
      const observation = await this.observer.observe()

      // Step 3: Decide - 做出决策
      const decision = await this.decisionEngine.decide(
        observation,
        currentGoal,
      )

      // Step 4: Act - 执行决策
      const actionResult = await this.actor.act(decision)

      // Step 5: Reflect - 反思结果
      const reflection = await this.reflector.reflect(
        actionResult,
        decision,
        observation,
      )

      // Step 6: 将反思生成的新目标添加到队列（自驱闭环的关键）
      await this.addNewGoalsFromReflection(
        reflection.newGoalDescriptions,
        currentGoal,
      )

      // Step 7: 更新目标状态
      if (currentGoal) {
        await this.updateGoalStatus(currentGoal, actionResult, reflection)
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

      this.logger.info('=== Agent cycle completed ===', {
        effective,
        outcome: reflection.outcome,
        newGoals: reflection.newGoalDescriptions.length,
        durationMs,
      })

      return result
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      const errorMsg = err instanceof Error ? err.message : String(err)

      this.logger.error('Agent cycle failed', { error: errorMsg, durationMs })

      throw err
    }
  }

  /**
   * 启动自动循环
   */
  start(): void {
    if (this.running) {
      this.logger.warn('Agent loop already running', {})
      return
    }

    this.running = true
    this.scheduler.start()
    this.logger.info('Agent loop started', {})
  }

  /**
   * 停止自动循环
   */
  stop(): void {
    if (!this.running) {
      return
    }

    this.scheduler.stop()
    this.running = false
    this.logger.info('Agent loop stopped', {})
  }

  isRunning(): boolean {
    return this.running
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
        priority: 'low', // 反思生成的目标默认低优先级
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
      // 失败时检查是否还有重试机会
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
        // 还有重试机会，重置为 pending
        await this.goalQueue.update(goal.id, { status: 'pending' })
        this.logger.info('Goal reset to pending for retry', {
          goalId: goal.id,
          attempts: goal.attempts,
          maxAttempts: goal.maxAttempts,
        })
      }
    } else {
      // partial: 保持 in_progress，下次循环继续处理
      this.logger.info('Goal partially completed, will retry', {
        goalId: goal.id,
        outcome: reflection.outcome,
      })
    }
  }
}
