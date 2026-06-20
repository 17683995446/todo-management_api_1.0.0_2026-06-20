import { performance } from 'node:perf_hooks'
import type { Logger } from '../../core_layer/logic/logger.js'
import type {
  CycleResult,
  IActor,
  IAgentLoop,
  IAgentScheduler,
  IAuditTrail,
  IDecisionEngine,
  IGoalQueue,
  ILifecycleManager,
  IMetricsCollector,
  IObserver,
  IPolicyEngine,
  IReflector,
  IResourceBudget,
} from '../agent.interface.js'
import type { ActionResult } from '../model/action_result.js'
import type { CreateAuditEventInput } from '../model/audit.js'
import type { BudgetLimit } from '../model/budget.js'
import type { Decision } from '../model/decision.js'
import type { CreateGoalInput, Goal } from '../model/goal.js'
import { METRIC_NAMES } from '../model/metrics.js'
import type { PolicyContext } from '../model/policy.js'

/**
 * 秩序化 Agent 自驱循环
 *
 * 在基础 OODA 循环之上集成五大治理纪律，确保 Agent 行为有序、可控、可追溯：
 *
 * 1. 生命周期管理（LifecycleManager）：状态机约束，仅在 running/draining 状态执行
 * 2. 策略引擎（PolicyEngine）：每项行动执行前评估，拒绝/调整不合规行为
 * 3. 审计日志（AuditTrail）：全程记录每个阶段事件，不可变可追溯
 * 4. 资源预算（ResourceBudget）：执行前检查预算，执行后记录消耗，超限降级
 * 5. 指标采集（MetricsCollector）：结构化采集运行指标，支持可观测性
 *
 * 秩序化循环流程：
 *   [Lifecycle Gate] → [Budget Gate] → [Audit cycle_start]
 *   → Observe → [Audit observation]
 *   → Decide → [Audit decision] → [Policy Gate] → [Audit policy_check]
 *   → [Audit action_start] → Act → [Budget record] → [Audit action_end]
 *   → Reflect → [Audit reflection]
 *   → Update Goals → [Audit cycle_end] → [Metrics record]
 *
 * 任何阶段失败：
 *   [Audit error] → [Lifecycle fail] → [Lifecycle recover] → [Lifecycle start]
 *
 * 这是秩序化的核心：自主性 + 纪律 = 可信赖的自驱。
 */
export class OrderedAgentLoop implements IAgentLoop {
  private cycleCount = 0

  constructor(
    private readonly logger: Logger,
    private readonly goalQueue: IGoalQueue,
    private readonly observer: IObserver,
    private readonly decisionEngine: IDecisionEngine,
    private readonly actor: IActor,
    private readonly reflector: IReflector,
    private readonly scheduler: IAgentScheduler,
    private readonly lifecycle: ILifecycleManager,
    private readonly policyEngine: IPolicyEngine,
    private readonly auditTrail: IAuditTrail,
    private readonly resourceBudget: IResourceBudget,
    private readonly metrics: IMetricsCollector,
  ) {
    // 注册调度器触发回调
    this.scheduler.onTrigger(async () => {
      try {
        await this.runCycle()
      } catch (err) {
        this.logger.error('Ordered cycle failed, attempting recovery', {
          error: err instanceof Error ? err.message : String(err),
        })
        await this.handleCycleError(err)
      }
    })

    // 初始化生命周期：initializing → ready
    this.lifecycle.transition('ready', 'Ordered agent loop constructed')
  }

  /**
   * 执行一次完整的秩序化 OODA 循环
   */
  async runCycle(): Promise<CycleResult> {
    const startTime = performance.now()

    // ── Gate 1: 生命周期检查 ──
    if (!this.lifecycle.canExecute()) {
      this.logger.warn('Cycle skipped: lifecycle state not executable', {
        state: this.lifecycle.getState(),
      })
      return this.noopResult('lifecycle_blocked')
    }

    // ── Gate 2: 资源预算检查 ──
    const budgetCheck = this.resourceBudget.check()
    if (!budgetCheck.allowed) {
      await this.audit({
        eventType: 'error',
        severity: 'warn',
        message: 'Cycle skipped: resource budget exhausted',
        details: { violatedLimits: budgetCheck.violatedLimits },
      })
      this.metrics.incrementCounter(METRIC_NAMES.POLICY_VIOLATIONS)
      // 预算耗尽，暂停循环
      if (this.lifecycle.isRunning()) {
        this.lifecycle.transition('pause', 'Resource budget exhausted')
        await this.audit({
          eventType: 'lifecycle',
          severity: 'warn',
          message: 'Lifecycle paused due to budget exhaustion',
        })
      }
      return this.noopResult('budget_exhausted')
    }

    // ── 循环开始 ──
    this.cycleCount++
    this.lifecycle.recordCycle()
    this.metrics.incrementCounter(METRIC_NAMES.CYCLES_TOTAL)

    await this.audit({
      eventType: 'cycle_start',
      message: `Cycle ${this.cycleCount} started`,
      cycleId: this.cycleCount,
      details: { budgetWarnings: budgetCheck.warnings.length },
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

      // Step 2: Observe - 观察系统状态
      const observation = await this.observer.observe()
      await this.audit({
        eventType: 'observation',
        message: 'Observation collected',
        cycleId: this.cycleCount,
        goalId: currentGoal?.id,
        observationId: observation.id,
        details: { systemHealth: observation.systemHealth },
      })

      // Step 3: Decide - 做出决策
      const decision = await this.decisionEngine.decide(
        observation,
        currentGoal,
      )
      await this.audit({
        eventType: 'decision',
        message: `Decision: ${decision.actionType}`,
        cycleId: this.cycleCount,
        goalId: currentGoal?.id,
        decisionId: decision.id,
        details: {
          actionType: decision.actionType,
          actionParams: decision.actionParams,
        },
      })

      // Step 4: [Policy Gate] 策略评估
      const actionResult = await this.executeWithPolicy(decision, currentGoal)

      // Step 5: Reflect - 反思结果
      const reflection = await this.reflector.reflect(
        actionResult,
        decision,
        observation,
      )
      await this.audit({
        eventType: 'reflection',
        message: `Reflection: ${reflection.outcome}`,
        cycleId: this.cycleCount,
        goalId: currentGoal?.id,
        actionResultId: actionResult.id,
        details: {
          outcome: reflection.outcome,
          learnings: reflection.learnings,
        },
      })

      // Step 6: 将反思生成的新目标添加到队列（自驱闭环）
      await this.addNewGoalsFromReflection(
        reflection.newGoalDescriptions,
        currentGoal,
      )

      // Step 7: 更新目标状态
      if (currentGoal) {
        await this.updateGoalStatus(currentGoal, actionResult, reflection)
      }

      // ── 循环结束 ──
      const durationMs = Math.round(performance.now() - startTime)
      const effective = decision.actionType !== 'noop' && actionResult.success

      // 记录资源消耗
      this.resourceBudget.recordUsage('actions', 1)
      this.resourceBudget.recordUsage('duration_ms', durationMs)

      // 记录指标
      this.metrics.recordHistogram(METRIC_NAMES.CYCLES_DURATION_MS, durationMs)
      if (effective) {
        this.metrics.incrementCounter(METRIC_NAMES.CYCLES_EFFECTIVE)
        this.metrics.incrementCounter(METRIC_NAMES.ACTIONS_SUCCESS)
      } else {
        this.metrics.incrementCounter(METRIC_NAMES.ACTIONS_FAILURE)
      }

      // 更新预算使用率指标
      const usage = this.resourceBudget.getUsage()
      const maxUtil =
        usage.length > 0 ? Math.max(...usage.map((u) => u.utilization)) : 0
      this.metrics.setGauge(METRIC_NAMES.BUDGET_UTILIZATION, maxUtil)

      await this.audit({
        eventType: 'cycle_end',
        message: `Cycle ${this.cycleCount} completed`,
        cycleId: this.cycleCount,
        goalId: currentGoal?.id,
        details: { effective, outcome: reflection.outcome, durationMs },
      })

      const result: CycleResult = {
        observation,
        decision,
        actionResult,
        reflection,
        effective,
        durationMs,
      }

      this.logger.info('Ordered cycle completed', {
        cycle: this.cycleCount,
        effective,
        durationMs,
      })

      return result
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      const errorMsg = err instanceof Error ? err.message : String(err)

      // 记录资源消耗（即使失败）
      this.resourceBudget.recordUsage('actions', 1)
      this.resourceBudget.recordUsage('duration_ms', durationMs)
      this.metrics.incrementCounter(METRIC_NAMES.ACTIONS_FAILURE)

      await this.audit({
        eventType: 'error',
        severity: 'error',
        message: `Cycle ${this.cycleCount} failed: ${errorMsg}`,
        cycleId: this.cycleCount,
        details: { error: errorMsg, durationMs },
      })

      throw err
    }
  }

  /**
   * 启动自动循环
   */
  start(): void {
    // 生命周期转换：ready → running
    if (this.lifecycle.getState() === 'initializing') {
      this.lifecycle.transition('ready')
    }
    if (this.lifecycle.getState() === 'ready') {
      this.lifecycle.transition('start', 'User requested start')
      this.audit({
        eventType: 'lifecycle',
        message: 'Agent started',
      }).catch(() => {})
    } else if (this.lifecycle.getState() === 'paused') {
      this.lifecycle.transition('resume', 'User resumed')
      this.audit({
        eventType: 'lifecycle',
        message: 'Agent resumed',
      }).catch(() => {})
    }

    this.scheduler.start()
    this.logger.info('Ordered agent loop started', {
      state: this.lifecycle.getState(),
    })
  }

  /**
   * 停止自动循环（优雅停止：draining → stopped）
   */
  stop(): void {
    this.scheduler.stop()

    // 优雅停止流程
    if (this.lifecycle.isRunning()) {
      this.lifecycle.transition('drain', 'User requested stop')
      this.audit({
        eventType: 'lifecycle',
        message: 'Agent draining',
      }).catch(() => {})
      // 在 draining 状态完成当前循环后停止
      this.lifecycle.transition('stop', 'Drain complete')
    } else if (this.lifecycle.getState() === 'paused') {
      this.lifecycle.transition('stop', 'Stopped from paused')
    }

    this.audit({
      eventType: 'lifecycle',
      message: 'Agent stopped',
    }).catch(() => {})

    this.logger.info('Ordered agent loop stopped', {
      state: this.lifecycle.getState(),
    })
  }

  /**
   * 暂停循环
   */
  pause(): void {
    if (this.lifecycle.isRunning()) {
      this.scheduler.stop()
      this.lifecycle.transition('pause', 'User requested pause')
      this.audit({
        eventType: 'lifecycle',
        message: 'Agent paused',
      }).catch(() => {})
      this.logger.info('Ordered agent loop paused')
    }
  }

  isRunning(): boolean {
    return this.lifecycle.isRunning()
  }

  /**
   * 获取当前生命周期状态
   */
  getState() {
    return this.lifecycle.getState()
  }

  /**
   * 获取循环计数
   */
  getCycleCount(): number {
    return this.cycleCount
  }

  // ═══════════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 带策略评估的行动执行
   */
  private async executeWithPolicy(
    decision: Decision,
    goal?: Goal | null,
  ): Promise<ActionResult> {
    // noop 不需要策略检查
    if (decision.actionType === 'noop') {
      return this.actor.act(decision)
    }

    // 构建策略上下文
    const usage = this.resourceBudget.getUsage()
    const actionsThisCycle =
      usage.find((u) => u.dimension === 'actions' && u.period === 'per_cycle')
        ?.used ?? 0
    const durationThisCycleMs =
      usage.find(
        (u) => u.dimension === 'duration_ms' && u.period === 'per_cycle',
      )?.used ?? 0
    const memoryUsageMb =
      usage.find((u) => u.dimension === 'memory_mb' && u.period === 'per_cycle')
        ?.used ?? 0

    const policyContext: PolicyContext = {
      actionType: decision.actionType,
      actionParams: decision.actionParams,
      goalId: goal?.id,
      timestamp: new Date().toISOString(),
      resourceUsage: { actionsThisCycle, durationThisCycleMs, memoryUsageMb },
    }

    // 策略评估
    const policyResult = await this.policyEngine.evaluate(policyContext)

    await this.audit({
      eventType: 'policy_check',
      message: `Policy check: ${policyResult.decision}`,
      cycleId: this.cycleCount,
      goalId: goal?.id,
      decisionId: decision.id,
      details: {
        decision: policyResult.decision,
        triggeredPolicies: policyResult.triggeredPolicies,
        reason: policyResult.reason,
      },
    })

    if (policyResult.decision === 'deny') {
      this.metrics.incrementCounter(METRIC_NAMES.POLICY_VIOLATIONS)

      await this.audit({
        eventType: 'policy_violation',
        severity: 'warn',
        message: `Action denied by policy: ${policyResult.reason}`,
        cycleId: this.cycleCount,
        goalId: goal?.id,
        decisionId: decision.id,
        details: {
          triggeredPolicies: policyResult.triggeredPolicies,
          reason: policyResult.reason,
        },
      })

      // 返回被拒绝的行动结果
      return {
        id: `${Date.now()}-denied`,
        decisionId: decision.id,
        success: false,
        output: {},
        error: `Policy denied: ${policyResult.reason}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

    // 策略调整参数（如果有）
    let effectiveDecision = decision
    if (policyResult.decision === 'adjust' && policyResult.adjustedParams) {
      effectiveDecision = {
        ...decision,
        actionParams: {
          ...decision.actionParams,
          ...policyResult.adjustedParams,
        },
      }
      this.logger.info('Action params adjusted by policy', {
        action: decision.actionType,
        adjusted: policyResult.adjustedParams,
      })
    }

    // 执行行动
    await this.audit({
      eventType: 'action_start',
      message: `Action: ${effectiveDecision.actionType}`,
      cycleId: this.cycleCount,
      goalId: goal?.id,
      decisionId: effectiveDecision.id,
      details: {
        actionType: effectiveDecision.actionType,
        params: effectiveDecision.actionParams,
      },
    })

    const actionStart = performance.now()
    const actionResult = await this.actor.act(effectiveDecision)
    const actionDuration = Math.round(performance.now() - actionStart)

    await this.audit({
      eventType: 'action_end',
      message: `Action ${actionResult.success ? 'succeeded' : 'failed'}`,
      cycleId: this.cycleCount,
      goalId: goal?.id,
      decisionId: effectiveDecision.id,
      actionResultId: actionResult.id,
      details: {
        success: actionResult.success,
        durationMs: actionDuration,
        error: actionResult.error,
      },
    })

    return actionResult
  }

  /**
   * 处理循环错误：尝试自动恢复
   */
  private async handleCycleError(err: unknown): Promise<void> {
    const errorMsg = err instanceof Error ? err.message : String(err)

    try {
      // 转入 failed 状态
      if (
        this.lifecycle.getState() !== 'failed' &&
        this.lifecycle.canTransition('failed')
      ) {
        this.lifecycle.transition('fail', `Cycle error: ${errorMsg}`)
        await this.audit({
          eventType: 'lifecycle',
          severity: 'error',
          message: 'Agent entered failed state',
          details: { error: errorMsg },
        })
      }

      // 尝试恢复
      if (this.lifecycle.canTransition('recovering')) {
        this.lifecycle.transition('recover', 'Auto-recovery initiated')
        await this.audit({
          eventType: 'recovery',
          message: 'Recovery initiated',
        })

        // 恢复后重新启动
        this.lifecycle.transition('start', 'Recovery complete')
        await this.audit({
          eventType: 'recovery',
          message: 'Recovery completed, agent running again',
        })
        this.logger.info('Agent recovered from failure')
      }
    } catch (recoveryErr) {
      this.logger.error('Recovery failed', {
        originalError: errorMsg,
        recoveryError:
          recoveryErr instanceof Error
            ? recoveryErr.message
            : String(recoveryErr),
      })
      await this.audit({
        eventType: 'error',
        severity: 'critical',
        message: 'Recovery failed',
        details: {
          originalError: errorMsg,
          recoveryError:
            recoveryErr instanceof Error
              ? recoveryErr.message
              : String(recoveryErr),
        },
      }).catch(() => {})
    }
  }

  /**
   * 记录审计事件（便捷方法）
   */
  private async audit(
    input: Omit<CreateAuditEventInput, 'details'> & {
      details?: Record<string, unknown>
    },
  ): Promise<void> {
    try {
      await this.auditTrail.record({
        ...input,
        details: input.details ?? {},
      })
    } catch (err) {
      // 审计失败不应影响主流程
      this.logger.error('Failed to record audit event', {
        eventType: input.eventType,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * 生成 noop 结果（当循环被阻止时）
   */
  private noopResult(reason: string): CycleResult {
    const now = new Date().toISOString()
    const noopId = `noop-${now}`
    return {
      observation: {
        id: noopId,
        timestamp: now,
        systemHealth: {
          status: 'healthy',
          uptimeSeconds: 0,
          memoryUsageMb: 0,
          dbConnected: true,
        },
        metrics: {
          requestCount: 0,
          errorRate: 0,
          avgResponseTimeMs: 0,
          cacheHitRate: 0,
          rateLimitHits: 0,
        },
        todoStats: {
          total: 0,
          completed: 0,
          pending: 0,
          overdue: 0,
          byPriority: {},
        },
        anomalies: [],
        raw: {},
      },
      decision: {
        id: noopId,
        observationId: noopId,
        actionType: 'noop',
        actionParams: {},
        reasoning: `Cycle blocked: ${reason}`,
        confidence: 0,
        createdAt: now,
      },
      actionResult: {
        id: noopId,
        decisionId: noopId,
        success: false,
        output: {},
        error: reason,
        durationMs: 0,
        timestamp: now,
      },
      reflection: {
        id: noopId,
        actionResultId: noopId,
        timestamp: now,
        outcome: 'partial',
        learnings: [`Cycle blocked: ${reason}`],
        newGoalDescriptions: [],
      },
      effective: false,
      durationMs: 0,
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
      this.metrics.incrementCounter(METRIC_NAMES.GOALS_COMPLETED)
      this.logger.info('Goal completed', { goalId: goal.id })
    } else if (reflection.outcome === 'failure') {
      if (goal.attempts >= goal.maxAttempts) {
        await this.goalQueue.markFailed(
          goal.id,
          `Failed after ${goal.attempts} attempts: ${actionResult.error}`,
        )
        this.metrics.incrementCounter(METRIC_NAMES.GOALS_FAILED)
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
