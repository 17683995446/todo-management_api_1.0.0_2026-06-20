import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentActor } from '../../src/agent_layer/core/actor.js'
import type { Decision } from '../../src/agent_layer/model/decision.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { InMemoryCache } from '../../src/core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import { type Todo, todoSqliteConfig } from '../../src/core_layer/model/todo.js'

describe('AgentActor', () => {
  let logger: ConsoleLogger
  let todoRepo: SqliteRepository<Todo>
  let cache: InMemoryCache<string, unknown>
  let actor: AgentActor
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
    logger = new ConsoleLogger(config, 'actor-test')
    dbPath = join(
      tmpdir(),
      `test-actor-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    cache = new InMemoryCache<string, unknown>(logger, 30000)
    actor = new AgentActor(logger, todoRepo, cache)
  })

  afterEach(() => {
    cache.close()
    todoRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  const makeDecision = (
    actionType: string,
    actionParams: Record<string, unknown> = {},
  ): Decision => ({
    id: randomUUID(),
    observationId: 'obs-1',
    actionType: actionType as Decision['actionType'],
    actionParams,
    reasoning: 'test',
    confidence: 1.0,
    createdAt: new Date().toISOString(),
  })

  it('should execute noop successfully', async () => {
    const decision = makeDecision('noop')
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    expect(result.output).toEqual({ message: 'No action needed' })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should create a todo', async () => {
    const decision = makeDecision('create_todo', {
      title: 'Auto-generated task',
      priority: 'high',
      tags: ['auto', 'test'],
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { todoId: string; title: string }
    expect(output.todoId).toBeDefined()
    expect(output.title).toBe('Auto-generated task')

    // Verify it was actually saved
    const todos = await todoRepo.findAll()
    expect(todos).toHaveLength(1)
    expect(todos[0].title).toBe('Auto-generated task')
    expect(todos[0].priority).toBe('high')
    expect(todos[0].userId).toBe('agent')
  })

  it('should complete a todo', async () => {
    // First create a todo
    const now = new Date()
    const todo = await todoRepo.create({
      id: randomUUID(),
      userId: 'u1',
      title: 'Test',
      completed: false,
      priority: 'medium',
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })

    const decision = makeDecision('complete_todo', { todoId: todo.id })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)

    // Verify it was completed
    const updated = await todoRepo.findById(todo.id)
    expect(updated?.completed).toBe(true)
  })

  it('should fail complete_todo without todoId', async () => {
    const decision = makeDecision('complete_todo', {})
    const result = await actor.act(decision)
    expect(result.success).toBe(false)
    expect(result.error).toContain('todoId is required')
  })

  it('should execute alert', async () => {
    const decision = makeDecision('alert', {
      severity: 'critical',
      message: 'System down!',
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { alerted: boolean; severity: string }
    expect(output.alerted).toBe(true)
    expect(output.severity).toBe('critical')
  })

  it('should optimize cache (clear)', async () => {
    // Populate cache
    await cache.set('key1', 'value1')
    await cache.set('key2', 'value2')

    const decision = makeDecision('optimize', {
      target: 'cache',
      action: 'clear',
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { optimized: boolean; target: string }
    expect(output.optimized).toBe(true)

    // Verify cache is cleared
    const stats = await cache.getStats()
    expect(stats.size).toBe(0)
  })

  it('should run self-test with db_connection check', async () => {
    const decision = makeDecision('self_test', { checks: ['db_connection'] })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as {
      checks: Record<string, boolean>
      allPassed: boolean
    }
    expect(output.checks.db_connection).toBe(true)
    expect(output.allPassed).toBe(true)
  })

  it('should run self-test with multiple checks', async () => {
    const decision = makeDecision('self_test', {
      checks: ['db_connection', 'cache_health', 'todo_integrity'],
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as {
      checks: Record<string, boolean>
      allPassed: boolean
    }
    expect(output.checks.db_connection).toBe(true)
    expect(output.checks.cache_health).toBe(true)
    expect(output.checks.todo_integrity).toBe(true)
    expect(output.allPassed).toBe(true)
  })

  it('should generate system_status report', async () => {
    const decision = makeDecision('report', {
      type: 'system_status',
      health: 'healthy',
      metrics: { requestCount: 100, errorRate: 0.01 },
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { report: string; type: string }
    expect(output.type).toBe('system_status')
    expect(output.report).toContain('System Status Report')
    expect(output.report).toContain('healthy')
  })

  it('should generate backlog_summary report', async () => {
    const decision = makeDecision('report', {
      type: 'backlog_summary',
      pendingCount: 50,
      total: 100,
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { report: string }
    expect(output.report).toContain('Backlog Summary')
    expect(output.report).toContain('50')
    expect(output.report).toContain('50.0%')
  })

  it('should generate goal_status report', async () => {
    const decision = makeDecision('report', {
      type: 'goal_status',
      goalDescription: 'Optimize system performance',
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { report: string }
    expect(output.report).toContain('Goal Status')
    expect(output.report).toContain('Optimize system performance')
  })

  it('should create goal description', async () => {
    const decision = makeDecision('create_goal', {
      description: 'Monitor cache performance',
      type: 'monitoring',
    })
    const result = await actor.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as {
      goalDescription: string
      goalType: string
    }
    expect(output.goalDescription).toBe('Monitor cache performance')
    expect(output.goalType).toBe('monitoring')
  })

  it('should handle unknown action type gracefully', async () => {
    const decision = makeDecision('unknown_action')
    const result = await actor.act(decision)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown action type')
  })

  it('should always include durationMs and timestamp', async () => {
    const decision = makeDecision('noop')
    const result = await actor.act(decision)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.timestamp).toBeDefined()
    expect(result.decisionId).toBe(decision.id)
  })

  it('should work without cache for optimize action', async () => {
    const actorNoCache = new AgentActor(logger, todoRepo, null)
    const decision = makeDecision('optimize', {
      target: 'cache',
      action: 'clear',
    })
    const result = await actorNoCache.act(decision)
    expect(result.success).toBe(true)
    const output = result.output as { optimized: boolean }
    expect(output.optimized).toBe(false)
  })
})
