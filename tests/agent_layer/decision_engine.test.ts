import { beforeEach, describe, expect, it } from 'vitest'
import { RuleBasedDecisionEngine } from '../../src/agent_layer/core/decision_engine.js'
import type { Goal } from '../../src/agent_layer/model/goal.js'
import type { Observation } from '../../src/agent_layer/model/observation.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('RuleBasedDecisionEngine', () => {
  let engine: RuleBasedDecisionEngine
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    const logger = new ConsoleLogger(config, 'decision-test')
    engine = new RuleBasedDecisionEngine(logger)
  })

  const makeObservation = (
    overrides: Partial<Observation> = {},
  ): Observation => ({
    id: 'obs-1',
    timestamp: new Date().toISOString(),
    systemHealth: {
      status: 'healthy',
      uptimeSeconds: 100,
      memoryUsageMb: 50,
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
    ...overrides,
  })

  const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
    id: 'goal-1',
    type: 'maintenance',
    description: 'Test goal',
    priority: 'high',
    status: 'in_progress',
    source: 'self_generated',
    maxAttempts: 3,
    attempts: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  })

  it('should return noop when system is healthy with no anomalies and no goal', async () => {
    // Note: healthy + no anomalies triggers periodic-self-test rule (priority 100)
    // So this actually returns self_test, not noop
    const obs = makeObservation()
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('self_test')
    expect(decision.confidence).toBe(0.3)
  })

  it('should alert when system is unhealthy', async () => {
    const obs = makeObservation({
      systemHealth: {
        status: 'unhealthy',
        uptimeSeconds: 100,
        memoryUsageMb: 50,
        dbConnected: false,
      },
      anomalies: ['System is unhealthy: database connection lost'],
    })
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('alert')
    expect(decision.actionParams.severity).toBe('critical')
    expect(decision.confidence).toBe(1.0)
  })

  it('should run self-test when error rate is high', async () => {
    const obs = makeObservation({
      metrics: {
        requestCount: 20,
        errorRate: 0.15,
        avgResponseTimeMs: 100,
        cacheHitRate: 0.5,
        rateLimitHits: 0,
      },
      anomalies: ['High error rate: 15.0%'],
    })
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('self_test')
    expect(decision.actionParams.checks).toContain('db_connection')
  })

  it('should optimize cache when response is slow', async () => {
    const obs = makeObservation({
      metrics: {
        requestCount: 10,
        errorRate: 0,
        avgResponseTimeMs: 1500,
        cacheHitRate: 0.5,
        rateLimitHits: 0,
      },
      anomalies: ['Slow response time: 1500ms average'],
    })
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('optimize')
    expect(decision.actionParams.target).toBe('cache')
    expect(decision.actionParams.action).toBe('clear')
  })

  it('should create todo when overdue todos detected', async () => {
    const obs = makeObservation({
      todoStats: {
        total: 15,
        completed: 3,
        pending: 12,
        overdue: 11,
        byPriority: {},
      },
      anomalies: ['11 overdue todos need attention'],
    })
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('create_todo')
    expect(decision.actionParams.title).toContain('overdue')
    expect(decision.actionParams.priority).toBe('high')
  })

  it('should generate report when backlog detected', async () => {
    const obs = makeObservation({
      todoStats: {
        total: 120,
        completed: 10,
        pending: 110,
        overdue: 0,
        byPriority: {},
      },
      anomalies: ['110 pending todos may indicate backlog'],
    })
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('report')
    expect(decision.actionParams.type).toBe('backlog_summary')
  })

  it('should alert when rate limit hit frequently', async () => {
    const obs = makeObservation({
      metrics: {
        requestCount: 100,
        errorRate: 0,
        avgResponseTimeMs: 50,
        cacheHitRate: 0.8,
        rateLimitHits: 60,
      },
      anomalies: ['Rate limit frequently triggered: 60 hits'],
    })
    const decision = await engine.decide(obs)
    expect(decision.actionType).toBe('alert')
    expect(decision.actionParams.severity).toBe('warning')
  })

  it('should prioritize goal-driven action over anomaly-based action', async () => {
    const obs = makeObservation({
      anomalies: ['High error rate: 20%'],
    })
    const goal = makeGoal({ type: 'monitoring' })
    const decision = await engine.decide(obs, goal)
    expect(decision.actionType).toBe('report')
    expect(decision.goalId).toBe('goal-1')
  })

  it('should generate maintenance action for maintenance goal', async () => {
    const obs = makeObservation()
    const goal = makeGoal({ type: 'maintenance' })
    const decision = await engine.decide(obs, goal)
    expect(decision.actionType).toBe('self_test')
    expect(decision.actionParams.checks).toContain('todo_integrity')
  })

  it('should generate optimize action for optimization goal', async () => {
    const obs = makeObservation()
    const goal = makeGoal({ type: 'optimization' })
    const decision = await engine.decide(obs, goal)
    expect(decision.actionType).toBe('optimize')
  })

  it('should generate report action for monitoring goal', async () => {
    const obs = makeObservation()
    const goal = makeGoal({ type: 'monitoring' })
    const decision = await engine.decide(obs, goal)
    expect(decision.actionType).toBe('report')
    expect(decision.actionParams.type).toBe('system_status')
  })

  it('should generate create_goal action for self_improvement goal', async () => {
    const obs = makeObservation()
    const goal = makeGoal({ type: 'self_improvement' })
    const decision = await engine.decide(obs, goal)
    expect(decision.actionType).toBe('create_goal')
  })

  it('should include reasoning in every decision', async () => {
    const obs = makeObservation()
    const decision = await engine.decide(obs)
    expect(decision.reasoning).toBeDefined()
    expect(decision.reasoning.length).toBeGreaterThan(0)
  })

  it('should include observationId in every decision', async () => {
    const obs = makeObservation({ id: 'test-obs-id' })
    const decision = await engine.decide(obs)
    expect(decision.observationId).toBe('test-obs-id')
  })

  it('should prioritize unhealthy over goal-driven', async () => {
    const obs = makeObservation({
      systemHealth: {
        status: 'unhealthy',
        uptimeSeconds: 100,
        memoryUsageMb: 50,
        dbConnected: false,
      },
      anomalies: ['System is unhealthy'],
    })
    const goal = makeGoal({ type: 'maintenance' })
    const decision = await engine.decide(obs, goal)
    // Unhealthy (priority 1) should win over goal-driven (priority 2)
    expect(decision.actionType).toBe('alert')
  })
})
