import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgentReflector } from '../../src/agent_layer/core/reflector.js'
import type { ActionResult } from '../../src/agent_layer/model/action_result.js'
import type { Decision } from '../../src/agent_layer/model/decision.js'
import type { Observation } from '../../src/agent_layer/model/observation.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('AgentReflector', () => {
  let reflector: AgentReflector

  beforeEach(() => {
    const config: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    const logger = new ConsoleLogger(config, 'reflector-test')
    reflector = new AgentReflector(logger)
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

  const makeDecision = (overrides: Partial<Decision> = {}): Decision => ({
    id: randomUUID(),
    observationId: 'obs-1',
    actionType: 'noop',
    actionParams: {},
    reasoning: 'test',
    confidence: 1.0,
    createdAt: new Date().toISOString(),
    ...overrides,
  })

  const makeActionResult = (
    overrides: Partial<ActionResult> = {},
  ): ActionResult => ({
    id: randomUUID(),
    decisionId: 'decision-1',
    success: true,
    output: {},
    durationMs: 50,
    timestamp: new Date().toISOString(),
    ...overrides,
  })

  it('should evaluate success outcome', async () => {
    const result = makeActionResult({ success: true })
    const decision = makeDecision({ actionType: 'noop' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.outcome).toBe('success')
  })

  it('should evaluate failure outcome', async () => {
    const result = makeActionResult({ success: false, error: 'DB timeout' })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.outcome).toBe('failure')
  })

  it('should evaluate partial outcome for self_test with failed checks', async () => {
    const result = makeActionResult({
      success: true,
      output: {
        checks: { db_connection: true, cache_health: false },
        allPassed: false,
      },
    })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.outcome).toBe('partial')
  })

  it('should evaluate partial outcome for optimize that did not work', async () => {
    const result = makeActionResult({
      success: true,
      output: { optimized: false },
    })
    const decision = makeDecision({ actionType: 'optimize' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.outcome).toBe('partial')
  })

  it('should extract learnings from successful action', async () => {
    const result = makeActionResult({ success: true, durationMs: 100 })
    const decision = makeDecision({ actionType: 'noop' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.learnings.length).toBeGreaterThan(0)
    expect(
      reflection.learnings.some((l) => l.includes('completed successfully')),
    ).toBe(true)
  })

  it('should extract learnings from failed action', async () => {
    const result = makeActionResult({
      success: false,
      error: 'Connection refused',
    })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.learnings.some((l) => l.includes('failed'))).toBe(true)
    expect(reflection.learnings.some((l) => l.includes('alternative'))).toBe(
      true,
    )
  })

  it('should extract learnings from self_test with failed checks', async () => {
    const result = makeActionResult({
      success: true,
      output: {
        checks: { db_connection: true, cache_health: false },
        allPassed: false,
      },
    })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.learnings.some(
        (l) => l.includes('cache_health') && l.includes('failed'),
      ),
    ).toBe(true)
  })

  it('should generate retry goal on failure', async () => {
    const result = makeActionResult({ success: false, error: 'Timeout' })
    const decision = makeDecision({ actionType: 'optimize' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) => g.includes('Retry')),
    ).toBe(true)
  })

  it('should generate fix goal for failed self_test', async () => {
    const result = makeActionResult({ success: false, error: 'Check failed' })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some(
        (g) => g.includes('Diagnose') || g.includes('fix'),
      ),
    ).toBe(true)
  })

  it('should generate fix goal for partial self_test', async () => {
    const result = makeActionResult({
      success: true,
      output: {
        checks: { db_connection: false, cache_health: true },
        allPassed: false,
      },
    })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) => g.includes('db_connection')),
    ).toBe(true)
  })

  it('should generate tracking goal after alert', async () => {
    const result = makeActionResult({
      success: true,
      output: { alerted: true },
    })
    const decision = makeDecision({ actionType: 'alert' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) => g.includes('Track')),
    ).toBe(true)
  })

  it('should generate monitoring goal after create_todo', async () => {
    const result = makeActionResult({
      success: true,
      output: { todoId: '123' },
    })
    const decision = makeDecision({ actionType: 'create_todo' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) => g.includes('Monitor')),
    ).toBe(true)
  })

  it('should generate goals for remaining anomalies after success', async () => {
    const result = makeActionResult({ success: true })
    const decision = makeDecision({ actionType: 'noop' })
    const obs = makeObservation({
      anomalies: ['High error rate: 20%', 'Slow response time: 2000ms'],
    })

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) =>
        g.includes('remaining anomalies'),
      ),
    ).toBe(true)
  })

  it('should not generate monitoring goal for non-periodic self_test', async () => {
    const result = makeActionResult({
      success: true,
      output: { checks: { db_connection: true }, allPassed: true },
    })
    const decision = makeDecision({
      actionType: 'self_test',
      actionParams: { periodic: false },
    })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) =>
        g.includes('periodic monitoring'),
      ),
    ).toBe(false)
  })

  it('should generate periodic monitoring goal for periodic self_test', async () => {
    const result = makeActionResult({
      success: true,
      output: { checks: { db_connection: true }, allPassed: true },
    })
    const decision = makeDecision({
      actionType: 'self_test',
      actionParams: { periodic: true },
    })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.newGoalDescriptions.some((g) =>
        g.includes('periodic monitoring'),
      ),
    ).toBe(true)
  })

  it('should flag slow actions in learnings', async () => {
    const result = makeActionResult({ success: true, durationMs: 6000 })
    const decision = makeDecision({ actionType: 'self_test' })
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(
      reflection.learnings.some(
        (l) => l.includes('6000ms') && l.includes('optimizing'),
      ),
    ).toBe(true)
  })

  it('should include actionResultId and timestamp', async () => {
    const result = makeActionResult({ id: 'result-123' })
    const decision = makeDecision()
    const obs = makeObservation()

    const reflection = await reflector.reflect(result, decision, obs)
    expect(reflection.actionResultId).toBe('result-123')
    expect(reflection.timestamp).toBeDefined()
    expect(reflection.id).toBeDefined()
  })
})
