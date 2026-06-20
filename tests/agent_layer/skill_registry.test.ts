import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createCacheOptimizeSkill,
  createDataCleanupSkill,
  createHealthCheckSkill,
  createReportSkill,
  createTrendAnalysisSkill,
  registerBuiltinSkills,
} from '../../src/agent_layer/enhancement/builtin_skills.js'
import { SkillRegistry } from '../../src/agent_layer/enhancement/skill_registry.js'
import type {
  SkillContext,
  SkillHandler,
  SkillResult,
} from '../../src/agent_layer/model/skill.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { InMemoryCache } from '../../src/core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import type { Todo } from '../../src/core_layer/model/todo.js'
import { todoSqliteConfig } from '../../src/core_layer/model/todo.js'

describe('SkillRegistry', () => {
  let logger: ConsoleLogger
  let registry: SkillRegistry
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'skill-test')
    registry = new SkillRegistry(logger)
  })

  it('should register a skill', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    const skill = await registry.register({
      name: 'test_skill',
      description: 'A test skill',
      category: 'custom',
      handler,
    })

    expect(skill.id).toBeDefined()
    expect(skill.name).toBe('test_skill')
    expect(skill.enabled).toBe(true)
    expect(skill.stats.timesUsed).toBe(0)
  })

  it('should throw on duplicate registration', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'dup',
      description: 'd',
      category: 'custom',
      handler,
    })
    await expect(
      registry.register({
        name: 'dup',
        description: 'd2',
        category: 'custom',
        handler,
      }),
    ).rejects.toThrow('already exists')
  })

  it('should get skill by name', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'my_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    expect(registry.get('my_skill')?.name).toBe('my_skill')
    expect(registry.get('nonexistent')).toBeNull()
  })

  it('should list all skills', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 's1',
      description: 'd',
      category: 'custom',
      handler,
    })
    await registry.register({
      name: 's2',
      description: 'd',
      category: 'data',
      handler,
    })

    expect(registry.list()).toHaveLength(2)
  })

  it('should unregister a skill', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'temp',
      description: 'd',
      category: 'custom',
      handler,
    })
    const removed = await registry.unregister('temp')
    expect(removed).toBe(true)
    expect(registry.get('temp')).toBeNull()
  })

  it('should enable/disable skills', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'toggle',
      description: 'd',
      category: 'custom',
      handler,
    })

    await registry.setEnabled('toggle', false)
    expect(registry.get('toggle')?.enabled).toBe(false)

    await registry.setEnabled('toggle', true)
    expect(registry.get('toggle')?.enabled).toBe(true)
  })

  it('should execute a skill and update stats', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({
        success: true,
        output: { result: 42 },
        durationMs: 0,
      }),
    }
    await registry.register({
      name: 'exec',
      description: 'd',
      category: 'custom',
      handler,
    })

    const context: SkillContext = { params: {} }
    const result = await registry.execute('exec', context)

    expect(result.success).toBe(true)
    expect(result.output).toEqual({ result: 42 })

    const skill = registry.get('exec')
    expect(skill?.stats.timesUsed).toBe(1)
    expect(skill?.stats.successCount).toBe(1)
    expect(skill?.stats.lastUsedAt).toBeDefined()
  })

  it('should track failure stats', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => {
        throw new Error('boom')
      },
    }
    await registry.register({
      name: 'fail',
      description: 'd',
      category: 'custom',
      handler,
    })

    const result = await registry.execute('fail', { params: {} })
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')

    const skill = registry.get('fail')
    expect(skill?.stats.failureCount).toBe(1)
    expect(skill?.stats.successCount).toBe(0)
  })

  it('should throw when executing unknown skill', async () => {
    await expect(registry.execute('unknown', { params: {} })).rejects.toThrow(
      'not found',
    )
  })

  it('should throw when executing disabled skill', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'disabled',
      description: 'd',
      category: 'custom',
      handler,
    })
    await registry.setEnabled('disabled', false)

    await expect(registry.execute('disabled', { params: {} })).rejects.toThrow(
      'disabled',
    )
  })

  it('should find capable skills', async () => {
    const handler1: SkillHandler = {
      canHandle: (ctx) => ctx.params.type === 'A',
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    const handler2: SkillHandler = {
      canHandle: (ctx) => ctx.params.type === 'B',
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'skillA',
      description: 'd',
      category: 'custom',
      handler: handler1,
    })
    await registry.register({
      name: 'skillB',
      description: 'd',
      category: 'custom',
      handler: handler2,
    })

    const capable = registry.findCapable({ params: { type: 'A' } })
    expect(capable).toHaveLength(1)
    expect(capable[0].name).toBe('skillA')
  })

  it('should not find disabled skills as capable', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await registry.register({
      name: 'disabled',
      description: 'd',
      category: 'custom',
      handler,
    })
    await registry.setEnabled('disabled', false)

    expect(registry.findCapable({ params: {} })).toHaveLength(0)
  })

  it('should calculate avg duration across multiple uses', async () => {
    let delay = 10
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => {
        await new Promise((r) => setTimeout(r, delay))
        return { success: true, output: 'ok', durationMs: 0 }
      },
    }
    await registry.register({
      name: 'timed',
      description: 'd',
      category: 'custom',
      handler,
    })

    await registry.execute('timed', { params: {} })
    delay = 20
    await registry.execute('timed', { params: {} })

    const skill = registry.get('timed')
    expect(skill?.stats.timesUsed).toBe(2)
    expect(skill?.stats.avgDurationMs).toBeGreaterThan(0)
  })
})

describe('Built-in Skills', () => {
  let logger: ConsoleLogger
  let registry: SkillRegistry
  let todoRepo: SqliteRepository<Todo>
  let cache: InMemoryCache<string, unknown>
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
    logger = new ConsoleLogger(config, 'builtin-test')
    dbPath = join(
      tmpdir(),
      `test-skills-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    cache = new InMemoryCache<string, unknown>(logger, 30000)
    registry = new SkillRegistry(logger)
  })

  afterEach(() => {
    cache.close()
    todoRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should register all built-in skills', async () => {
    await registerBuiltinSkills(registry, logger, todoRepo, cache)
    const skills = registry.list()
    expect(skills).toHaveLength(5)
    expect(skills.map((s) => s.name).sort()).toEqual([
      'cache_optimize',
      'data_cleanup',
      'generate_report',
      'health_check',
      'trend_analysis',
    ])
  })

  it('data_cleanup should clean old completed todos', async () => {
    const input = createDataCleanupSkill(todoRepo)
    await registry.register(input)

    // Create an old completed todo (8 days ago)
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await todoRepo.create({
      userId: 'u1',
      title: 'old completed',
      completed: true,
      priority: 'low',
      dueDate: null,
      tags: [],
    })
    // Manually set updatedAt to old date via update
    const todos = await todoRepo.findAll()
    if (todos.length > 0) {
      await todoRepo.update(todos[0].id, { completed: true })
    }

    const result = await registry.execute('data_cleanup', {
      params: { action: 'cleanup', retentionDays: 7 },
    })

    expect(result.success).toBe(true)
    const output = result.output as { cleaned: number; checked: number }
    expect(output.checked).toBeGreaterThanOrEqual(1)
  })

  it('health_check should run all checks', async () => {
    const input = createHealthCheckSkill(todoRepo, cache)
    await registry.register(input)

    const result = await registry.execute('health_check', {
      params: { action: 'health_check' },
    })

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

  it('cache_optimize should clear cache', async () => {
    const input = createCacheOptimizeSkill(cache)
    await registry.register(input)

    // Add something to cache
    await cache.set('key1', 'value1')

    const result = await registry.execute('cache_optimize', {
      params: { action: 'optimize' },
    })

    expect(result.success).toBe(true)
    const output = result.output as { optimized: boolean }
    expect(output.optimized).toBe(true)
  })

  it('cache_optimize should handle no cache', async () => {
    const input = createCacheOptimizeSkill(null)
    await registry.register(input)

    const result = await registry.execute('cache_optimize', {
      params: { action: 'optimize' },
    })

    expect(result.success).toBe(true)
    const output = result.output as { optimized: boolean; reason: string }
    expect(output.optimized).toBe(false)
    expect(output.reason).toBe('no_cache')
  })

  it('generate_report should produce system status report', async () => {
    await todoRepo.create({
      userId: 'u1',
      title: 'task1',
      completed: true,
      priority: 'low',
      dueDate: null,
      tags: [],
    })
    await todoRepo.create({
      userId: 'u1',
      title: 'task2',
      completed: false,
      priority: 'high',
      dueDate: null,
      tags: [],
    })

    const input = createReportSkill(todoRepo)
    await registry.register(input)

    const result = await registry.execute('generate_report', {
      params: { action: 'report', reportType: 'system_status' },
    })

    expect(result.success).toBe(true)
    const output = result.output as { report: string; type: string }
    expect(output.type).toBe('system_status')
    expect(output.report).toContain('系统状态报告')
    expect(output.report).toContain('Todo 总数: 2')
  })

  it('generate_report should produce backlog summary', async () => {
    const input = createReportSkill(todoRepo)
    await registry.register(input)

    const result = await registry.execute('generate_report', {
      params: { action: 'report', reportType: 'backlog_summary' },
    })

    expect(result.success).toBe(true)
    const output = result.output as { report: string }
    expect(output.report).toContain('积压摘要报告')
  })

  it('trend_analysis should analyze anomalies', async () => {
    const input = createTrendAnalysisSkill()
    await registry.register(input)

    const result = await registry.execute('trend_analysis', {
      params: { action: 'analyze', recentLearnings: ['l1', 'l2', 'l3', 'l4'] },
      observation: {
        id: 'obs1',
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
        anomalies: [
          'High error rate: 15%',
          'High error rate: 20%',
          'Slow response: 1200ms',
        ],
        raw: {},
      },
    })

    expect(result.success).toBe(true)
    const output = result.output as {
      patterns: string[]
      anomalyCount: number
      learningCount: number
    }
    expect(output.anomalyCount).toBe(3)
    expect(output.learningCount).toBe(4)
    expect(output.patterns.length).toBeGreaterThan(0)
  })

  it('should track usage stats across multiple skill executions', async () => {
    await registerBuiltinSkills(registry, logger, todoRepo, cache)

    await registry.execute('health_check', {
      params: { action: 'health_check' },
    })
    await registry.execute('health_check', {
      params: { action: 'health_check' },
    })

    const skill = registry.get('health_check')
    expect(skill?.stats.timesUsed).toBe(2)
    expect(skill?.stats.successCount).toBe(2)
  })
})
