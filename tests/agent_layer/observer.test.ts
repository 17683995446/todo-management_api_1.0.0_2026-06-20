import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SystemObserver } from '../../src/agent_layer/core/observer.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { InMemoryCache } from '../../src/core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import { type Todo, todoSqliteConfig } from '../../src/core_layer/model/todo.js'

describe('SystemObserver', () => {
  let logger: ConsoleLogger
  let todoRepo: SqliteRepository<Todo>
  let cache: InMemoryCache<string, unknown>
  let observer: SystemObserver
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
    logger = new ConsoleLogger(config, 'observer-test')
    dbPath = join(
      tmpdir(),
      `test-observer-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    cache = new InMemoryCache<string, unknown>(logger, 30000)
    observer = new SystemObserver(logger, todoRepo, cache)
  })

  afterEach(() => {
    cache.close()
    todoRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should produce an observation with all fields', async () => {
    const obs = await observer.observe()
    expect(obs.id).toBeDefined()
    expect(obs.timestamp).toBeDefined()
    expect(obs.systemHealth).toBeDefined()
    expect(obs.metrics).toBeDefined()
    expect(obs.todoStats).toBeDefined()
    expect(obs.anomalies).toEqual([])
    expect(obs.raw).toBeDefined()
  })

  it('should report healthy status when DB is connected', async () => {
    const obs = await observer.observe()
    expect(obs.systemHealth.status).toBe('healthy')
    expect(obs.systemHealth.dbConnected).toBe(true)
    expect(obs.systemHealth.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(obs.systemHealth.memoryUsageMb).toBeGreaterThan(0)
  })

  it('should report zero metrics initially', async () => {
    const obs = await observer.observe()
    expect(obs.metrics.requestCount).toBe(0)
    expect(obs.metrics.errorRate).toBe(0)
    expect(obs.metrics.avgResponseTimeMs).toBe(0)
    expect(obs.metrics.cacheHitRate).toBe(0)
    expect(obs.metrics.rateLimitHits).toBe(0)
  })

  it('should track request count and response time', async () => {
    observer.recordRequest(100)
    observer.recordRequest(200)
    observer.recordRequest(300, true) // error

    const obs = await observer.observe()
    expect(obs.metrics.requestCount).toBe(3)
    expect(obs.metrics.avgResponseTimeMs).toBe(200) // (100+200+300)/3
    expect(obs.metrics.errorRate).toBeCloseTo(1 / 3, 2)
  })

  it('should track rate limit hits', async () => {
    observer.recordRateLimitHit()
    observer.recordRateLimitHit()

    const obs = await observer.observe()
    expect(obs.metrics.rateLimitHits).toBe(2)
  })

  it('should collect todo stats correctly', async () => {
    const now = new Date()
    const past = new Date(now.getTime() - 86400000) // 1 day ago
    const future = new Date(now.getTime() + 86400000) // 1 day later

    await todoRepo.create({
      id: '1',
      userId: 'u1',
      title: 'done task',
      completed: true,
      priority: 'low',
      dueDate: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    await todoRepo.create({
      id: '2',
      userId: 'u1',
      title: 'pending task',
      completed: false,
      priority: 'high',
      dueDate: future,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })
    await todoRepo.create({
      id: '3',
      userId: 'u1',
      title: 'overdue task',
      completed: false,
      priority: 'urgent',
      dueDate: past,
      tags: [],
      createdAt: now,
      updatedAt: now,
    })

    const obs = await observer.observe()
    expect(obs.todoStats.total).toBe(3)
    expect(obs.todoStats.completed).toBe(1)
    expect(obs.todoStats.pending).toBe(2)
    expect(obs.todoStats.overdue).toBe(1)
    expect(obs.todoStats.byPriority.low).toBe(1)
    expect(obs.todoStats.byPriority.high).toBe(1)
    expect(obs.todoStats.byPriority.urgent).toBe(1)
  })

  it('should detect high error rate anomaly', async () => {
    // Record 15 requests, 3 errors (20% error rate > 10% threshold)
    for (let i = 0; i < 12; i++) observer.recordRequest(50)
    for (let i = 0; i < 3; i++) observer.recordRequest(50, true)

    const obs = await observer.observe()
    expect(obs.anomalies.some((a) => a.includes('High error rate'))).toBe(true)
  })

  it('should detect slow response time anomaly', async () => {
    observer.recordRequest(1500)

    const obs = await observer.observe()
    expect(obs.anomalies.some((a) => a.includes('Slow response time'))).toBe(
      true,
    )
  })

  it('should detect overdue todos anomaly', async () => {
    const past = new Date(Date.now() - 86400000)
    const now = new Date()
    // Create 11 overdue todos (> 10 threshold)
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

    const obs = await observer.observe()
    expect(obs.anomalies.some((a) => a.includes('overdue todos'))).toBe(true)
  })

  it('should detect backlog anomaly', async () => {
    const now = new Date()
    // Create 101 pending todos (> 100 threshold)
    for (let i = 0; i < 101; i++) {
      await todoRepo.create({
        id: `backlog-${i}`,
        userId: 'u1',
        title: `task ${i}`,
        completed: false,
        priority: 'low',
        dueDate: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
    }

    const obs = await observer.observe()
    expect(obs.anomalies.some((a) => a.includes('backlog'))).toBe(true)
  })

  it('should include raw system info', async () => {
    const obs = await observer.observe()
    expect(obs.raw.processUptime).toBeGreaterThan(0)
    expect(obs.raw.nodeVersion).toBeDefined()
    expect(obs.raw.platform).toBeDefined()
    expect(obs.raw.pid).toBeGreaterThan(0)
  })

  it('should work without cache', async () => {
    const observerNoCache = new SystemObserver(logger, todoRepo, null)
    const obs = await observerNoCache.observe()
    expect(obs.metrics.cacheHitRate).toBe(0)
  })
})
