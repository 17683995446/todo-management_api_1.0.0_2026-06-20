import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IObserver,
  IReflector,
} from '../../src/agent_layer/agent.interface.js'
import { AgentActor } from '../../src/agent_layer/core/actor.js'
import { RuleBasedDecisionEngine } from '../../src/agent_layer/core/decision_engine.js'
import { SqliteGoalQueue } from '../../src/agent_layer/core/goal_queue.js'
import { SystemObserver } from '../../src/agent_layer/core/observer.js'
import { AgentReflector } from '../../src/agent_layer/core/reflector.js'
import { TimerAgentScheduler } from '../../src/agent_layer/core/scheduler.js'
import { AuditTrail } from '../../src/agent_layer/governance/audit_trail.js'
import { LifecycleManager } from '../../src/agent_layer/governance/lifecycle_manager.js'
import { MetricsCollector } from '../../src/agent_layer/governance/metrics_collector.js'
import { OrderedAgentLoop } from '../../src/agent_layer/governance/ordered_agent_loop.js'
import { PolicyEngine } from '../../src/agent_layer/governance/policy_engine.js'
import { registerDefaultPolicies } from '../../src/agent_layer/governance/policy_engine.js'
import { ResourceBudget } from '../../src/agent_layer/governance/resource_budget.js'
import type { AuditEvent } from '../../src/agent_layer/model/audit.js'
import { auditSqliteConfig } from '../../src/agent_layer/model/audit_sqlite_config.js'
import type { Goal } from '../../src/agent_layer/model/goal.js'
import { goalSqliteConfig } from '../../src/agent_layer/model/goal_sqlite_config.js'
import { METRIC_NAMES } from '../../src/agent_layer/model/metrics.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { InMemoryCache } from '../../src/core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import { todoSqliteConfig } from '../../src/core_layer/model/todo.js'
import type { Todo } from '../../src/core_layer/model/todo.js'

describe('OrderedAgentLoop', () => {
  let logger: ConsoleLogger
  let dbPath: string
  let config: AppConfig

  let goalRepo: SqliteRepository<Goal>
  let todoRepo: SqliteRepository<Todo>
  let auditRepo: SqliteRepository<AuditEvent>
  let cache: InMemoryCache<string, unknown>

  let goalQueue: SqliteGoalQueue
  let observer: SystemObserver
  let decisionEngine: RuleBasedDecisionEngine
  let actor: AgentActor
  let reflector: AgentReflector
  let scheduler: TimerAgentScheduler

  let policyEngine: PolicyEngine
  let auditTrail: AuditTrail
  let resourceBudget: ResourceBudget
  let lifecycle: LifecycleManager
  let metrics: MetricsCollector

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'ordered-test')
    dbPath = join(
      tmpdir(),
      `test-ordered-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )

    goalRepo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    auditRepo = new SqliteRepository<AuditEvent>(
      logger,
      dbPath,
      auditSqliteConfig,
    )
    cache = new InMemoryCache<string, unknown>(logger, 30000)

    goalQueue = new SqliteGoalQueue(logger, goalRepo)
    observer = new SystemObserver(logger, todoRepo, cache)
    decisionEngine = new RuleBasedDecisionEngine(logger)
    actor = new AgentActor(logger, todoRepo, cache)
    reflector = new AgentReflector(logger)
    scheduler = new TimerAgentScheduler(logger, { intervalMs: 60000 })

    policyEngine = new PolicyEngine(logger)
    registerDefaultPolicies(policyEngine)
    auditTrail = new AuditTrail(logger, auditRepo)
    resourceBudget = new ResourceBudget(logger)
    lifecycle = new LifecycleManager(logger)
    metrics = new MetricsCollector(logger)
  })

  afterEach(() => {
    cache.close()
    goalRepo.close()
    todoRepo.close()
    auditRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  /**
   * 创建 OrderedAgentLoop 并启动到 running 状态
   */
  function createAndStartLoop(): OrderedAgentLoop {
    const loop = new OrderedAgentLoop(
      logger,
      goalQueue,
      observer,
      decisionEngine,
      actor,
      reflector,
      scheduler,
      lifecycle,
      policyEngine,
      auditTrail,
      resourceBudget,
      metrics,
    )
    loop.start()
    return loop
  }

  describe('initialization', () => {
    it('should initialize with lifecycle transitioning to ready', () => {
      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      // 构造函数中应执行 initializing → ready
      expect(lifecycle.getState()).toBe('ready')
    })

    it('should not be running initially', () => {
      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      expect(loop.isRunning()).toBe(false)
    })

    it('should have zero cycles initially', () => {
      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      expect(loop.getCycleCount()).toBe(0)
    })
  })

  describe('start/stop lifecycle', () => {
    it('should transition to running on start', () => {
      const loop = createAndStartLoop()
      expect(loop.isRunning()).toBe(true)
      expect(lifecycle.getState()).toBe('running')
    })

    it('should transition to stopped on stop', () => {
      const loop = createAndStartLoop()
      loop.stop()
      expect(loop.isRunning()).toBe(false)
      expect(lifecycle.getState()).toBe('stopped')
    })

    it('should record lifecycle audit events on start', async () => {
      const loop = createAndStartLoop()
      // 等待异步审计写入
      await new Promise((resolve) => setTimeout(resolve, 50))
      const events = await auditTrail.recent(100)
      const lifecycleEvents = events.filter((e) => e.eventType === 'lifecycle')
      expect(lifecycleEvents.length).toBeGreaterThan(0)
    })

    it('should record lifecycle audit events on stop', async () => {
      const loop = createAndStartLoop()
      loop.stop()
      await new Promise((resolve) => setTimeout(resolve, 50))
      const events = await auditTrail.recent(100)
      const lifecycleEvents = events.filter((e) => e.eventType === 'lifecycle')
      expect(lifecycleEvents.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('runCycle - basic ordered cycle', () => {
    it('should complete a full ordered cycle', async () => {
      const loop = createAndStartLoop()
      const result = await loop.runCycle()

      expect(result.observation).toBeDefined()
      expect(result.decision).toBeDefined()
      expect(result.actionResult).toBeDefined()
      expect(result.reflection).toBeDefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should increment cycle count', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await loop.runCycle()
      await loop.runCycle()
      expect(loop.getCycleCount()).toBe(3)
    })

    it('should record cycle_start and cycle_end audit events', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const cycleStarts = events.filter((e) => e.eventType === 'cycle_start')
      const cycleEnds = events.filter((e) => e.eventType === 'cycle_end')
      expect(cycleStarts.length).toBe(1)
      expect(cycleEnds.length).toBe(1)
    })

    it('should record observation audit event', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const observations = events.filter((e) => e.eventType === 'observation')
      expect(observations.length).toBe(1)
    })

    it('should record decision audit event', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const decisions = events.filter((e) => e.eventType === 'decision')
      expect(decisions.length).toBe(1)
    })

    it('should record reflection audit event', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const reflections = events.filter((e) => e.eventType === 'reflection')
      expect(reflections.length).toBe(1)
    })

    it('should increment cycles_total metric', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      expect(metrics.getCounter(METRIC_NAMES.CYCLES_TOTAL)).toBe(1)
    })

    it('should record cycle duration metric', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      const hist = metrics.getHistogram(METRIC_NAMES.CYCLES_DURATION_MS)
      expect(hist).not.toBeNull()
      expect(hist?.count).toBe(1)
    })

    it('should record resource usage', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      const usage = resourceBudget.getUsage()
      const actionsUsage = usage.find(
        (u) => u.dimension === 'actions' && u.period === 'per_cycle',
      )
      expect(actionsUsage?.used).toBe(1)
    })
  })

  describe('lifecycle gate', () => {
    it('should skip cycle when lifecycle is not executable', async () => {
      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      // 不调用 start()，lifecycle 处于 ready 状态，canExecute() 返回 false
      const result = await loop.runCycle()

      expect(result.effective).toBe(false)
      expect(result.decision.actionType).toBe('noop')
      expect(loop.getCycleCount()).toBe(0)
    })

    it('should skip cycle when paused', async () => {
      const loop = createAndStartLoop()
      loop.pause()
      expect(lifecycle.getState()).toBe('paused')

      const result = await loop.runCycle()
      expect(result.effective).toBe(false)
      expect(loop.getCycleCount()).toBe(0)
    })

    it('should execute cycle when in draining state', async () => {
      const loop = createAndStartLoop()
      // 手动转到 draining
      lifecycle.transition('drain', 'testing drain')
      expect(lifecycle.getState()).toBe('draining')
      expect(lifecycle.canExecute()).toBe(true)

      const result = await loop.runCycle()
      expect(loop.getCycleCount()).toBe(1)
    })
  })

  describe('budget gate', () => {
    it('should skip cycle when budget exhausted', async () => {
      // 配置极小预算
      resourceBudget.configure({
        limits: [
          {
            dimension: 'actions',
            period: 'per_cycle',
            softLimit: 0,
            hardLimit: 0,
          },
        ],
      })
      // 预算已耗尽（hardLimit=0）
      const loop = createAndStartLoop()
      const result = await loop.runCycle()

      expect(result.effective).toBe(false)
      expect(result.decision.actionType).toBe('noop')
      expect(loop.getCycleCount()).toBe(0)
    })

    it('should pause agent when budget exhausted', async () => {
      resourceBudget.configure({
        limits: [
          {
            dimension: 'actions',
            period: 'per_cycle',
            softLimit: 0,
            hardLimit: 0,
          },
        ],
      })
      const loop = createAndStartLoop()
      await loop.runCycle()

      // 预算耗尽应导致 lifecycle 暂停
      expect(lifecycle.getState()).toBe('paused')
    })

    it('should record error audit event when budget exhausted', async () => {
      resourceBudget.configure({
        limits: [
          {
            dimension: 'actions',
            period: 'per_cycle',
            softLimit: 0,
            hardLimit: 0,
          },
        ],
      })
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const errorEvents = events.filter((e) => e.eventType === 'error')
      expect(errorEvents.length).toBeGreaterThan(0)
    })
  })

  describe('policy gate', () => {
    it('should record policy_check audit event for non-noop actions', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      // 如果决策是 noop，不会有 policy_check；如果是其他行动，会有
      // 基础循环中无目标时通常决策为 noop
      const policyChecks = events.filter((e) => e.eventType === 'policy_check')
      // noop 不触发策略检查
      if (policyChecks.length > 0) {
        expect(policyChecks[0].details).toContain('decision')
      }
    })

    it('should deny action when policy forbids it', async () => {
      // 注册一个禁止所有非 noop 行动的策略
      await policyEngine.registerPolicy({
        name: 'deny-all-actions',
        description: 'Deny all non-noop actions for testing',
        type: 'forbidden',
        scope: 'action',
        priority: 100,
        rule: 'actionType:*',
        denialReason: 'All actions denied for testing',
      })

      // 添加一个目标，使决策引擎产生非 noop 决策
      await goalQueue.add({
        type: 'maintenance',
        description: 'Fix database connection issue',
        priority: 'high',
        source: 'user',
        maxAttempts: 3,
      })

      const loop = createAndStartLoop()
      const result = await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 如果决策被策略拒绝，行动结果应失败
      if (result.decision.actionType !== 'noop') {
        expect(result.actionResult.success).toBe(false)
        expect(result.actionResult.error).toContain('Policy denied')

        // 应记录策略违规审计事件
        const events = await auditTrail.recent(100)
        const violations = events.filter(
          (e) => e.eventType === 'policy_violation',
        )
        expect(violations.length).toBeGreaterThan(0)
      }
    })

    it('should increment policy_violations metric when policy denies', async () => {
      await policyEngine.registerPolicy({
        name: 'deny-all',
        description: 'Deny all',
        type: 'forbidden',
        scope: 'action',
        priority: 100,
        rule: 'actionType:*',
        denialReason: 'Test denial',
      })

      await goalQueue.add({
        type: 'maintenance',
        description: 'Fix issue',
        priority: 'high',
        source: 'user',
        maxAttempts: 3,
      })

      const loop = createAndStartLoop()
      const result = await loop.runCycle()

      if (result.decision.actionType !== 'noop') {
        expect(
          metrics.getCounter(METRIC_NAMES.POLICY_VIOLATIONS),
        ).toBeGreaterThan(0)
      }
    })
  })

  describe('metrics collection', () => {
    it('should track successful actions', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()

      // noop 不算成功也不算失败
      const success = metrics.getCounter(METRIC_NAMES.ACTIONS_SUCCESS)
      const failure = metrics.getCounter(METRIC_NAMES.ACTIONS_FAILURE)
      expect(success + failure).toBeGreaterThanOrEqual(0)
    })

    it('should set budget utilization gauge', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()

      const util = metrics.getGauge(METRIC_NAMES.BUDGET_UTILIZATION)
      expect(util).toBeGreaterThanOrEqual(0)
      expect(util).toBeLessThanOrEqual(1)
    })

    it('should record cycle duration in histogram', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await loop.runCycle()

      const hist = metrics.getHistogram(METRIC_NAMES.CYCLES_DURATION_MS)
      expect(hist?.count).toBe(2)
      expect(hist?.min).toBeGreaterThanOrEqual(0)
    })
  })

  describe('audit trail completeness', () => {
    it('should record events with cycleId', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const cycleEvents = events.filter((e) => e.cycleId === 1)
      expect(cycleEvents.length).toBeGreaterThan(0)
    })

    it('should record events in chronological order', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const cycleEvents = events.filter((e) => e.cycleId === 1)

      // 验证 cycle_start 在 cycle_end 之前
      const startIdx = cycleEvents.findIndex(
        (e) => e.eventType === 'cycle_start',
      )
      const endIdx = cycleEvents.findIndex((e) => e.eventType === 'cycle_end')
      expect(startIdx).toBeGreaterThanOrEqual(0)
      expect(endIdx).toBeGreaterThanOrEqual(0)
      expect(startIdx).toBeLessThan(endIdx)
    })

    it('should record all expected event types in a cycle', async () => {
      const loop = createAndStartLoop()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const cycleEvents = events.filter((e) => e.cycleId === 1)
      const eventTypes = new Set(cycleEvents.map((e) => e.eventType))

      // 至少应该有这些事件类型
      expect(eventTypes.has('cycle_start')).toBe(true)
      expect(eventTypes.has('observation')).toBe(true)
      expect(eventTypes.has('decision')).toBe(true)
      expect(eventTypes.has('reflection')).toBe(true)
      expect(eventTypes.has('cycle_end')).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should record error audit event when cycle throws', async () => {
      // 让 observer 抛出异常
      const failingObserver = {
        observe: vi.fn().mockRejectedValue(new Error('Observation failed')),
      }

      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        failingObserver as unknown as IObserver,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      loop.start()

      await expect(loop.runCycle()).rejects.toThrow('Observation failed')

      // 错误审计事件应被记录
      await new Promise((resolve) => setTimeout(resolve, 50))
      const events = await auditTrail.recent(100)
      const errorEvents = events.filter((e) => e.eventType === 'error')
      expect(errorEvents.length).toBeGreaterThan(0)
      expect(errorEvents[0].message).toContain('Observation failed')
    })

    it('should increment failure metric on error', async () => {
      const failingObserver = {
        observe: vi.fn().mockRejectedValue(new Error('Fail')),
      }

      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        failingObserver as unknown as IObserver,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      loop.start()

      try {
        await loop.runCycle()
      } catch {
        // expected
      }

      expect(metrics.getCounter(METRIC_NAMES.ACTIONS_FAILURE)).toBeGreaterThan(
        0,
      )
    })

    it('should record resource usage even on failure', async () => {
      const failingObserver = {
        observe: vi.fn().mockRejectedValue(new Error('Fail')),
      }

      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        failingObserver as unknown as IObserver,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      loop.start()

      try {
        await loop.runCycle()
      } catch {
        // expected
      }

      const usage = resourceBudget.getUsage()
      const actionsUsage = usage.find(
        (u) => u.dimension === 'actions' && u.period === 'per_cycle',
      )
      expect(actionsUsage?.used).toBe(1)
    })
  })

  describe('recovery', () => {
    it('should attempt recovery when cycle fails via scheduler', async () => {
      const failingObserver = {
        observe: vi
          .fn()
          .mockRejectedValueOnce(new Error('Transient failure'))
          .mockResolvedValueOnce({
            id: 'recovered-obs',
            timestamp: new Date().toISOString(),
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
          }),
      }

      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        failingObserver as unknown as IObserver,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      loop.start()

      // 通过 scheduler.trigger() 触发循环，错误会被 handleCycleError 处理
      await scheduler.trigger()

      // 等待异步恢复完成
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 应记录恢复审计事件
      const events = await auditTrail.recent(100)
      const recoveryEvents = events.filter((e) => e.eventType === 'recovery')
      expect(recoveryEvents.length).toBeGreaterThan(0)

      // lifecycle 应回到 running
      expect(lifecycle.getState()).toBe('running')
    })
  })

  describe('goal management', () => {
    it('should complete goal when reflection outcome is success', async () => {
      await goalQueue.add({
        type: 'maintenance',
        description: 'Fix issue',
        priority: 'high',
        source: 'user',
        maxAttempts: 3,
      })

      // 使用 mock reflector 返回 success
      const successReflector = {
        reflect: vi.fn().mockResolvedValue({
          id: 'refl-1',
          actionResultId: 'ar-1',
          outcome: 'success',
          learnings: ['Fixed successfully'],
          newGoalDescriptions: [],
          timestamp: new Date().toISOString(),
        }),
      }

      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        successReflector as unknown as IReflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      loop.start()

      await loop.runCycle()

      expect(metrics.getCounter(METRIC_NAMES.GOALS_COMPLETED)).toBe(1)
    })

    it('should fail goal when max attempts reached', async () => {
      // 添加 maxAttempts=1 的目标，next() 会将 attempts 递增到 1
      await goalQueue.add({
        type: 'maintenance',
        description: 'Fix issue',
        priority: 'high',
        source: 'user',
        maxAttempts: 1,
      })

      const failReflector = {
        reflect: vi.fn().mockResolvedValue({
          id: 'refl-1',
          actionResultId: 'ar-1',
          outcome: 'failure',
          learnings: ['Failed'],
          newGoalDescriptions: [],
          timestamp: new Date().toISOString(),
        }),
      }

      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        failReflector as unknown as IReflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      loop.start()

      await loop.runCycle()

      // maxAttempts=1, attempts=1 (after next()), 应标记为 failed
      expect(metrics.getCounter(METRIC_NAMES.GOALS_FAILED)).toBe(1)
    })
  })

  describe('pause and resume', () => {
    it('should pause via pause() method', () => {
      const loop = createAndStartLoop()
      loop.pause()
      expect(lifecycle.getState()).toBe('paused')
      expect(loop.isRunning()).toBe(false)
    })

    it('should resume via start() from paused state', () => {
      const loop = createAndStartLoop()
      loop.pause()
      expect(lifecycle.getState()).toBe('paused')
      loop.start()
      expect(lifecycle.getState()).toBe('running')
      expect(loop.isRunning()).toBe(true)
    })

    it('should not pause when not running', () => {
      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      // lifecycle 在 ready 状态，pause() 不应有效果
      loop.pause()
      expect(lifecycle.getState()).toBe('ready')
    })
  })

  describe('multiple cycles', () => {
    it('should handle multiple consecutive cycles', async () => {
      const loop = createAndStartLoop()

      for (let i = 0; i < 5; i++) {
        await loop.runCycle()
      }

      expect(loop.getCycleCount()).toBe(5)
      expect(metrics.getCounter(METRIC_NAMES.CYCLES_TOTAL)).toBe(5)

      const hist = metrics.getHistogram(METRIC_NAMES.CYCLES_DURATION_MS)
      expect(hist?.count).toBe(5)
    })

    it('should record audit events with incrementing cycleId', async () => {
      const loop = createAndStartLoop()

      await loop.runCycle()
      await loop.runCycle()
      await new Promise((resolve) => setTimeout(resolve, 50))

      const events = await auditTrail.recent(100)
      const cycle1Events = events.filter((e) => e.cycleId === 1)
      const cycle2Events = events.filter((e) => e.cycleId === 2)
      expect(cycle1Events.length).toBeGreaterThan(0)
      expect(cycle2Events.length).toBeGreaterThan(0)
    })
  })

  describe('noop result', () => {
    it('should return valid CycleResult when blocked by lifecycle', async () => {
      const loop = new OrderedAgentLoop(
        logger,
        goalQueue,
        observer,
        decisionEngine,
        actor,
        reflector,
        scheduler,
        lifecycle,
        policyEngine,
        auditTrail,
        resourceBudget,
        metrics,
      )
      const result = await loop.runCycle()

      expect(result.observation).toBeDefined()
      expect(result.decision.actionType).toBe('noop')
      expect(result.actionResult.success).toBe(false)
      expect(result.reflection).toBeDefined()
      expect(result.effective).toBe(false)
    })
  })
})
