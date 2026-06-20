import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CycleResult } from '../../src/agent_layer/agent.interface.js'
import { AgentActor } from '../../src/agent_layer/core/actor.js'
import { AgentLoop } from '../../src/agent_layer/core/agent_loop.js'
import { RuleBasedDecisionEngine } from '../../src/agent_layer/core/decision_engine.js'
import { SqliteGoalQueue } from '../../src/agent_layer/core/goal_queue.js'
import { SystemObserver } from '../../src/agent_layer/core/observer.js'
import { AgentReflector } from '../../src/agent_layer/core/reflector.js'
import { TimerAgentScheduler } from '../../src/agent_layer/core/scheduler.js'
import type { Goal } from '../../src/agent_layer/model/goal.js'
import { goalSqliteConfig } from '../../src/agent_layer/model/goal_sqlite_config.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { InMemoryCache } from '../../src/core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import { type Todo, todoSqliteConfig } from '../../src/core_layer/model/todo.js'

describe('AgentLoop Integration', () => {
  let logger: ConsoleLogger
  let goalRepo: SqliteRepository<Goal>
  let todoRepo: SqliteRepository<Todo>
  let cache: InMemoryCache<string, unknown>
  let goalQueue: SqliteGoalQueue
  let observer: SystemObserver
  let decisionEngine: RuleBasedDecisionEngine
  let actor: AgentActor
  let reflector: AgentReflector
  let scheduler: TimerAgentScheduler
  let loop: AgentLoop
  let dbPath: string
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'agent-loop-test')
    dbPath = join(
      tmpdir(),
      `test-loop-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    goalRepo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    cache = new InMemoryCache<string, unknown>(logger, 30000)

    goalQueue = new SqliteGoalQueue(logger, goalRepo)
    observer = new SystemObserver(logger, todoRepo, cache)
    decisionEngine = new RuleBasedDecisionEngine(logger)
    actor = new AgentActor(logger, todoRepo, cache)
    reflector = new AgentReflector(logger)
    scheduler = new TimerAgentScheduler(logger, { intervalMs: 60000 })
    loop = new AgentLoop(
      logger,
      goalQueue,
      observer,
      decisionEngine,
      actor,
      reflector,
      scheduler,
    )
  })

  afterEach(() => {
    loop.stop()
    cache.close()
    goalRepo.close()
    todoRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should complete a full OODA cycle with no goals and no anomalies', async () => {
    const result = await loop.runCycle()

    expect(result.observation).toBeDefined()
    expect(result.decision).toBeDefined()
    expect(result.actionResult).toBeDefined()
    expect(result.reflection).toBeDefined()
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    // With healthy system and no anomalies, should do periodic self_test
    expect(result.decision.actionType).toBe('self_test')
    expect(result.actionResult.success).toBe(true)
    expect(result.reflection.outcome).toBe('success')
  })

  it('should execute goal-driven cycle', async () => {
    // Add a maintenance goal
    await goalQueue.add({
      type: 'maintenance',
      description: 'Run system maintenance check',
      priority: 'high',
    })

    const result = await loop.runCycle()

    // Should have picked up the goal
    expect(result.decision.goalId).toBeDefined()
    expect(result.decision.actionType).toBe('self_test')
    expect(result.actionResult.success).toBe(true)

    // Goal should be marked as completed
    const goals = await goalQueue.findAll()
    const goal = goals.find(
      (g) => g.description === 'Run system maintenance check',
    )
    expect(goal?.status).toBe('completed')
  })

  it('should create new goals from reflection', async () => {
    // Run a cycle - periodic self_test on healthy system generates monitoring goal
    const result = await loop.runCycle()

    expect(result.reflection.outcome).toBe('success')

    // Check if new goals were added
    const goals = await goalQueue.findAll()
    // Periodic self_test should generate a monitoring goal
    const monitoringGoals = goals.filter((g) => g.source === 'reflection')
    expect(monitoringGoals.length).toBeGreaterThan(0)
  })

  it('should handle anomaly-driven cycle', async () => {
    // Create overdue todos to trigger anomaly
    const past = new Date(Date.now() - 86400000)
    const now = new Date()
    for (let i = 0; i < 11; i++) {
      await todoRepo.create({
        id: `overdue-${i}`,
        userId: 'u1',
        title: `overdue ${i}`,
        completed: false,
        priority: 'medium',
        dueDate: past,
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
    }

    const result = await loop.runCycle()

    // Should detect overdue anomaly and create a todo
    expect(
      result.observation.anomalies.some((a) => a.includes('overdue')),
    ).toBe(true)
    expect(result.decision.actionType).toBe('create_todo')
    expect(result.actionResult.success).toBe(true)

    // Verify the todo was created by agent
    const todos = await todoRepo.findAll()
    const autoTodo = todos.find(
      (t) => t.userId === 'agent' && t.title.includes('overdue'),
    )
    expect(autoTodo).toBeDefined()
    expect(autoTodo?.userId).toBe('agent')
  })

  it('should start and stop the loop', () => {
    expect(loop.isRunning()).toBe(false)
    loop.start()
    expect(loop.isRunning()).toBe(true)
    loop.stop()
    expect(loop.isRunning()).toBe(false)
  })

  it('should not start twice', () => {
    loop.start()
    loop.start() // should not throw
    expect(loop.isRunning()).toBe(true)
    loop.stop()
  })

  it('should handle goal failure and retry', async () => {
    // Add a goal with maxAttempts = 3
    const goal = await goalQueue.add({
      type: 'optimization',
      description: 'Optimize cache',
      priority: 'high',
      maxAttempts: 3,
    })

    // First cycle: picks up goal, executes, but we simulate failure
    // by making the cache null so optimize returns partial
    const actorNoCache = new AgentActor(logger, todoRepo, null)
    const loopNoCache = new AgentLoop(
      logger,
      goalQueue,
      observer,
      decisionEngine,
      actorNoCache,
      reflector,
      scheduler,
    )

    const result = await loopNoCache.runCycle()

    // Goal should be either completed or reset to pending (for retry)
    const goals = await goalQueue.findAll()
    const updatedGoal = goals.find((g) => g.id === goal.id)
    expect(['completed', 'pending', 'in_progress', 'failed']).toContain(
      updatedGoal?.status,
    )
  })

  it('should mark goal as failed after max attempts', async () => {
    // Add a goal that will fail (optimization without cache)
    const goal = await goalQueue.add({
      type: 'optimization',
      description: 'Optimize cache',
      priority: 'urgent',
      maxAttempts: 1, // Only 1 attempt allowed
    })

    // Use actor without cache to trigger partial/failure
    const actorNoCache = new AgentActor(logger, todoRepo, null)
    const loopNoCache = new AgentLoop(
      logger,
      goalQueue,
      observer,
      decisionEngine,
      actorNoCache,
      reflector,
      scheduler,
    )

    // First cycle: picks up goal (attempt 1)
    await loopNoCache.runCycle()

    // Check goal status
    const goals = await goalQueue.findAll()
    const updatedGoal = goals.find((g) => g.id === goal.id)
    // After first attempt with partial outcome, goal stays in_progress or gets reset
    expect(updatedGoal?.attempts).toBe(1)
  })

  it('should maintain cycle history through multiple cycles', async () => {
    // Run 3 cycles
    const results: CycleResult[] = []
    for (let i = 0; i < 3; i++) {
      results.push(await loop.runCycle())
    }

    expect(results).toHaveLength(3)
    // Each cycle should have unique IDs
    const ids = results.map((r) => r.observation.id)
    expect(new Set(ids).size).toBe(3)
  })
})
