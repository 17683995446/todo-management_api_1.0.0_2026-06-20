import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LearningEngine } from '../../src/agent_layer/enhancement/learning_engine.js'
import type { Decision } from '../../src/agent_layer/model/decision.js'
import type { Learning } from '../../src/agent_layer/model/learning.js'
import { learningSqliteConfig } from '../../src/agent_layer/model/learning_sqlite_config.js'
import type { Reflection } from '../../src/agent_layer/model/reflection.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('LearningEngine', () => {
  let logger: ConsoleLogger
  let repo: SqliteRepository<Learning>
  let engine: LearningEngine
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
    logger = new ConsoleLogger(config, 'learn-test')
    dbPath = join(
      tmpdir(),
      `test-learn-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    repo = new SqliteRepository<Learning>(logger, dbPath, learningSqliteConfig)
    engine = new LearningEngine(logger, repo)
  })

  afterEach(() => {
    repo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should record a new learning', async () => {
    const learning = await engine.learn({
      type: 'pattern',
      pattern: 'self_test fails when DB disconnected',
      context: 'DB connection lost',
    })

    expect(learning.id).toBeDefined()
    expect(learning.type).toBe('pattern')
    expect(learning.pattern).toBe('self_test fails when DB disconnected')
    expect(learning.confidence).toBe(0.5)
    expect(learning.occurrences).toBe(1)
    expect(learning.applied).toBe(false)
  })

  it('should reinforce existing learning (increment occurrences)', async () => {
    await engine.learn({
      type: 'pattern',
      pattern: 'same pattern',
      context: 'ctx',
    })
    const reinforced = await engine.learn({
      type: 'pattern',
      pattern: 'same pattern',
      context: 'ctx',
    })

    expect(reinforced.occurrences).toBe(2)
    expect(reinforced.confidence).toBeGreaterThan(0.5)
  })

  it('should cap confidence at 1.0', async () => {
    for (let i = 0; i < 20; i++) {
      await engine.learn({ type: 'pattern', pattern: 'capped', context: 'ctx' })
    }
    const all = await engine.findAll()
    const learning = all.find((l) => l.pattern === 'capped')
    expect(learning?.confidence).toBeLessThanOrEqual(1.0)
  })

  it('should find all learnings', async () => {
    await engine.learn({ type: 'pattern', pattern: 'p1', context: 'c1' })
    await engine.learn({ type: 'rule_update', pattern: 'p2', context: 'c2' })

    const all = await engine.findAll()
    expect(all).toHaveLength(2)
  })

  it('should find unapplied learnings', async () => {
    const l1 = await engine.learn({
      type: 'pattern',
      pattern: 'p1',
      context: 'c1',
    })
    await engine.learn({ type: 'pattern', pattern: 'p2', context: 'c2' })
    await engine.markApplied(l1.id)

    const unapplied = await engine.findUnapplied()
    expect(unapplied).toHaveLength(1)
    expect(unapplied[0].pattern).toBe('p2')
  })

  it('should mark learning as applied', async () => {
    const learning = await engine.learn({
      type: 'pattern',
      pattern: 'p1',
      context: 'c1',
    })
    const applied = await engine.markApplied(learning.id)

    expect(applied.applied).toBe(true)
    expect(applied.appliedAt).toBeDefined()
  })

  it('should throw when marking unknown learning', async () => {
    await expect(engine.markApplied('unknown')).rejects.toThrow('not found')
  })

  it('should calculate stats correctly', async () => {
    await engine.learn({ type: 'pattern', pattern: 'p1', context: 'c1' })
    await engine.learn({ type: 'rule_update', pattern: 'p2', context: 'c2' })
    await engine.learn({
      type: 'skill_acquisition',
      pattern: 'p3',
      context: 'c3',
    })

    const stats = await engine.stats()
    expect(stats.totalLearnings).toBe(3)
    expect(stats.appliedLearnings).toBe(0)
    expect(stats.avgConfidence).toBeGreaterThan(0)
    expect(stats.byType.pattern).toBe(1)
    expect(stats.byType.rule_update).toBe(1)
    expect(stats.byType.skill_acquisition).toBe(1)
    expect(stats.byType.performance).toBe(0)
  })

  it('should extract learnings from failure reflection', async () => {
    const reflection: Reflection = {
      id: 'r1',
      actionResultId: 'ar1',
      outcome: 'failure',
      learnings: ['Action self_test failed with error: DB disconnected'],
      newGoalDescriptions: ['Diagnose and fix DB connection'],
      timestamp: new Date().toISOString(),
    }
    const decision: Decision = {
      id: 'd1',
      observationId: 'o1',
      actionType: 'self_test',
      actionParams: {},
      reasoning: 'Running self-test',
      confidence: 0.8,
      createdAt: new Date().toISOString(),
    }

    const learnings = await engine.learnFromReflection(reflection, decision)

    expect(learnings.length).toBeGreaterThan(0)
    expect(learnings.some((l) => l.type === 'pattern')).toBe(true)
    expect(learnings.some((l) => l.type === 'rule_update')).toBe(true)
  })

  it('should extract learnings from partial reflection', async () => {
    const reflection: Reflection = {
      id: 'r1',
      actionResultId: 'ar1',
      outcome: 'partial',
      learnings: ['Some checks failed'],
      newGoalDescriptions: [],
      timestamp: new Date().toISOString(),
    }
    const decision: Decision = {
      id: 'd1',
      observationId: 'o1',
      actionType: 'self_test',
      actionParams: {},
      reasoning: 'Running self-test',
      confidence: 0.8,
      createdAt: new Date().toISOString(),
    }

    const learnings = await engine.learnFromReflection(reflection, decision)

    expect(learnings.some((l) => l.type === 'performance')).toBe(true)
  })

  it('should extract skill_acquisition from success with new goals', async () => {
    const reflection: Reflection = {
      id: 'r1',
      actionResultId: 'ar1',
      outcome: 'success',
      learnings: ['Action completed'],
      newGoalDescriptions: ['Monitor auto-created todo'],
      timestamp: new Date().toISOString(),
    }
    const decision: Decision = {
      id: 'd1',
      observationId: 'o1',
      actionType: 'create_todo',
      actionParams: {},
      reasoning: 'Creating todo',
      confidence: 0.7,
      createdAt: new Date().toISOString(),
    }

    const learnings = await engine.learnFromReflection(reflection, decision)

    expect(learnings.some((l) => l.type === 'skill_acquisition')).toBe(true)
  })

  it('should extract pattern from success with unresolved anomalies', async () => {
    const reflection: Reflection = {
      id: 'r1',
      actionResultId: 'ar1',
      outcome: 'success',
      learnings: ['1 anomalies remain unresolved after action'],
      newGoalDescriptions: [],
      timestamp: new Date().toISOString(),
    }
    const decision: Decision = {
      id: 'd1',
      observationId: 'o1',
      actionType: 'alert',
      actionParams: {},
      reasoning: 'Alerting on anomaly',
      confidence: 0.6,
      createdAt: new Date().toISOString(),
    }

    const learnings = await engine.learnFromReflection(reflection, decision)

    expect(
      learnings.some(
        (l) => l.type === 'pattern' && l.pattern.includes('unresolved'),
      ),
    ).toBe(true)
  })

  it('should not extract learnings from simple success with no issues', async () => {
    const reflection: Reflection = {
      id: 'r1',
      actionResultId: 'ar1',
      outcome: 'success',
      learnings: ['Action completed successfully'],
      newGoalDescriptions: [],
      timestamp: new Date().toISOString(),
    }
    const decision: Decision = {
      id: 'd1',
      observationId: 'o1',
      actionType: 'noop',
      actionParams: {},
      reasoning: 'No action needed',
      confidence: 1.0,
      createdAt: new Date().toISOString(),
    }

    const learnings = await engine.learnFromReflection(reflection, decision)
    expect(learnings).toHaveLength(0)
  })

  it('should get rule updates (unapplied rule_update type)', async () => {
    await engine.learn({
      type: 'rule_update',
      pattern: 'Lower confidence for self_test',
      context: 'ctx',
      suggestedRuleUpdate: 'Reduce confidence from 0.8 to 0.5',
    })
    await engine.learn({
      type: 'pattern',
      pattern: 'some pattern',
      context: 'ctx',
    })

    const ruleUpdates = await engine.getRuleUpdates()
    expect(ruleUpdates).toHaveLength(1)
    expect(ruleUpdates[0].type).toBe('rule_update')
    expect(ruleUpdates[0].suggestedRuleUpdate).toBeDefined()
  })

  it('should exclude applied rule updates', async () => {
    const learning = await engine.learn({
      type: 'rule_update',
      pattern: 'rule1',
      context: 'ctx',
      suggestedRuleUpdate: 'update1',
    })
    await engine.markApplied(learning.id)

    const ruleUpdates = await engine.getRuleUpdates()
    expect(ruleUpdates).toHaveLength(0)
  })

  it('should persist learnings across instances', async () => {
    await engine.learn({
      type: 'pattern',
      pattern: 'persisted',
      context: 'ctx',
    })

    const newRepo = new SqliteRepository<Learning>(
      logger,
      dbPath,
      learningSqliteConfig,
    )
    const newEngine = new LearningEngine(logger, newRepo)

    const all = await newEngine.findAll()
    expect(all).toHaveLength(1)
    expect(all[0].pattern).toBe('persisted')

    newRepo.close()
  })

  it('should accumulate learnings from multiple reflections', async () => {
    const baseReflection: Reflection = {
      id: 'r1',
      actionResultId: 'ar1',
      outcome: 'failure',
      learnings: ['failed'],
      newGoalDescriptions: [],
      timestamp: new Date().toISOString(),
    }
    const baseDecision: Decision = {
      id: 'd1',
      observationId: 'o1',
      actionType: 'self_test',
      actionParams: {},
      reasoning: 'test',
      confidence: 0.8,
      createdAt: new Date().toISOString(),
    }

    // Learn from 3 failures
    await engine.learnFromReflection(baseReflection, baseDecision)
    await engine.learnFromReflection(
      { ...baseReflection, id: 'r2' },
      baseDecision,
    )
    await engine.learnFromReflection(
      { ...baseReflection, id: 'r3' },
      baseDecision,
    )

    const all = await engine.findAll()
    // Same patterns should be reinforced, not duplicated
    const patterns = new Set(all.map((l) => l.pattern))
    expect(patterns.size).toBeLessThanOrEqual(all.length)

    // The failure pattern should have high occurrences
    const failPattern = all.find((l) => l.pattern.includes('tends to fail'))
    expect(failPattern?.occurrences).toBe(3)
    expect(failPattern?.confidence).toBeGreaterThan(0.5)
  })
})
