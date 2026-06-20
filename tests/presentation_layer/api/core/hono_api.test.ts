import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HonoApiServer } from '../../../../src/presentation_layer/api/core/hono_api.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import { SqliteRepository } from '../../../../src/core_layer/data/access/sqlite_repository.js'
import { AuthService } from '../../../../src/core_layer/logic/auth_service.js'
import { TelemetryManager } from '../../../../src/core_layer/telemetry/telemetry_context.js'
import { InMemoryCache } from '../../../../src/core_layer/logic/in_memory_cache.js'
import { todoSqliteConfig, type Todo } from '../../../../src/core_layer/model/todo.js'
import { userSqliteConfig, type User } from '../../../../src/core_layer/model/user.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

describe('HonoApiServer', () => {
  let mockConfig: AppConfig
  let logger: ConsoleLogger
  let todoRepo: SqliteRepository<Todo>
  let userRepo: SqliteRepository<User>
  let authService: AuthService
  let telemetry: TelemetryManager
  let server: HonoApiServer
  let dbPath: string
  let authToken: string

  beforeEach(async () => {
    mockConfig = {
      app: { name: 'test-api', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'hono-api-test')
    dbPath = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    userRepo = new SqliteRepository<User>(logger, dbPath, userSqliteConfig)
    authService = new AuthService(logger, 'test-secret')
    telemetry = new TelemetryManager(mockConfig.app.name, mockConfig.app.version)
    server = new HonoApiServer(mockConfig, logger, todoRepo, userRepo, authService, telemetry)

    // Register a test user and get token
    const regRes = await server.getApp().request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    const regBody = await regRes.json()
    authToken = regBody.data.token
  })

  afterEach(async () => {
    await server.stop().catch(() => {})
    todoRepo.close()
    userRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`
  })

  it('should expose the Hono app instance', () => {
    expect(server.getApp()).toBeDefined()
  })

  it('should return health check response', async () => {
    const res = await server.getApp().request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toBe('ok')
  })

  it('should return 401 without auth token for todos', async () => {
    const res = await server.getApp().request('/api/todos')
    expect(res.status).toBe(401)
  })

  it('should create a todo and return 201', async () => {
    const res = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test todo' })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('Test todo')
    expect(body.data.completed).toBe(false)
  })

  it('should get all todos for authenticated user', async () => {
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Todo 1' })
    })
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Todo 2' })
    })
    const res = await server.getApp().request('/api/todos', {
      headers: authHeaders()
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
  })

  it('should update a todo', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' })
    })
    const created = await createRes.json()
    const res = await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ completed: true })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.completed).toBe(true)
  })

  it('should delete a todo', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' })
    })
    const created = await createRes.json()
    const res = await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeNull()
  })

  it('should reject invalid token', async () => {
    const res = await server.getApp().request('/api/todos', {
      headers: { Authorization: 'Bearer invalid-token' }
    })
    expect(res.status).toBe(401)
  })

  it('should isolate todos between users', async () => {
    // Create todo as first user
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'User1 Todo' })
    })

    // Register second user
    const reg2 = await server.getApp().request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user2', password: 'TestPass99!' })
    })
    const reg2Body = await reg2.json()
    const token2 = reg2Body.data.token

    // User2 should see 0 todos
    const res2 = await server.getApp().request('/api/todos', {
      headers: { Authorization: `Bearer ${token2}` }
    })
    const body2 = await res2.json()
    expect(body2.data).toHaveLength(0)

    // User2 creates a todo
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ title: 'User2 Todo' })
    })

    // User1 should still see only 1 todo
    const res1 = await server.getApp().request('/api/todos', {
      headers: authHeaders()
    })
    const body1 = await res1.json()
    expect(body1.data).toHaveLength(1)
    expect(body1.data[0].title).toBe('User1 Todo')
  })

  // ===== Phase 4: Rich Todo Features API Tests =====

  it('should create a todo with priority, dueDate, and tags', async () => {
    const res = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        title: 'Rich Todo',
        priority: 'high',
        dueDate: '2026-12-31T23:59:59.000Z',
        tags: ['work', 'important']
      })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.priority).toBe('high')
    expect(body.data.dueDate).not.toBeNull()
    expect(body.data.tags).toEqual(['work', 'important'])
  })

  it('should default priority to medium and tags to empty', async () => {
    const res = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Simple Todo' })
    })
    const body = await res.json()
    expect(body.data.priority).toBe('medium')
    expect(body.data.dueDate).toBeNull()
    expect(body.data.tags).toEqual([])
  })

  it('should filter by status=completed', async () => {
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Pending One' }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Done One', completed: true }) })

    const res = await server.getApp().request('/api/todos?status=completed', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].title).toBe('Done One')
  })

  it('should filter by status=pending', async () => {
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Pending One' }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Done One', completed: true }) })

    const res = await server.getApp().request('/api/todos?status=pending', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].title).toBe('Pending One')
  })

  it('should filter by priority', async () => {
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Low', priority: 'low' }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'High', priority: 'high' }) })

    const res = await server.getApp().request('/api/todos?priority=high', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].title).toBe('High')
  })

  it('should search by title keyword', async () => {
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Learn TypeScript' }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Write docs' }) })

    const res = await server.getApp().request('/api/todos?search=learn', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].title).toBe('Learn TypeScript')
  })

  it('should filter by tag', async () => {
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'T1', tags: ['work'] }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'T2', tags: ['personal'] }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'T3', tags: ['work', 'review'] }) })

    const res = await server.getApp().request('/api/todos?tag=work', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(2)
  })

  it('should sort by title descending', async () => {
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Banana' }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Apple' }) })
    await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: 'Cherry' }) })

    const res = await server.getApp().request('/api/todos?sort=title&order=desc', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data.map((t: Todo) => t.title)).toEqual(['Cherry', 'Banana', 'Apple'])
  })

  it('should paginate with limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await server.getApp().request('/api/todos', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title: `Todo ${i}` }) })
    }

    const res = await server.getApp().request('/api/todos?limit=2&offset=1', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.total).toBe(5)
    expect(body.limit).toBe(2)
    expect(body.offset).toBe(1)
  })

  it('should update priority, dueDate, and tags', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' })
    })
    const created = await createRes.json()
    const res = await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ priority: 'urgent', tags: ['new-tag'], dueDate: '2026-06-30T12:00:00.000Z' })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.priority).toBe('urgent')
    expect(body.data.tags).toEqual(['new-tag'])
    expect(body.data.dueDate).not.toBeNull()
  })

  it('should clear dueDate by setting to null', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test', dueDate: '2026-12-31T23:59:59.000Z' })
    })
    const created = await createRes.json()
    const res = await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ dueDate: null })
    })
    const body = await res.json()
    expect(body.data.dueDate).toBeNull()
  })

  it('should reject invalid priority value', async () => {
    const res = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test', priority: 'invalid' })
    })
    expect(res.status).toBe(400)
  })

  it('should reject empty update body', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' })
    })
    const created = await createRes.json()
    const res = await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({})
    })
    expect(res.status).toBe(400)
  })
})

// ===== Phase 6: Cache Integration Tests =====
describe('HonoApiServer with Cache', () => {
  let mockConfig: AppConfig
  let logger: ConsoleLogger
  let todoRepo: SqliteRepository<Todo>
  let userRepo: SqliteRepository<User>
  let authService: AuthService
  let telemetry: TelemetryManager
  let cache: InMemoryCache<string, unknown>
  let server: HonoApiServer
  let dbPath: string
  let authToken: string

  beforeEach(async () => {
    mockConfig = {
      app: { name: 'test-api-cache', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'hono-api-cache-test')
    dbPath = join(tmpdir(), `test-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    userRepo = new SqliteRepository<User>(logger, dbPath, userSqliteConfig)
    authService = new AuthService(logger, 'test-secret')
    telemetry = new TelemetryManager(mockConfig.app.name, mockConfig.app.version)
    cache = new InMemoryCache<string, unknown>(logger)
    server = new HonoApiServer(mockConfig, logger, todoRepo, userRepo, authService, telemetry, cache)

    const regRes = await server.getApp().request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cacheuser', password: 'TestPass99!' })
    })
    const regBody = await regRes.json()
    authToken = regBody.data.token
  })

  afterEach(async () => {
    await server.stop().catch(() => {})
    cache.close()
    todoRepo.close()
    userRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`
  })

  it('should serve cached list on second identical request', async () => {
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Cached Todo' })
    })

    // First request: cache miss, populates cache
    const res1 = await server.getApp().request('/api/todos', { headers: authHeaders() })
    const body1 = await res1.json()
    expect(body1.data).toHaveLength(1)

    // Second request: should be a cache hit
    const res2 = await server.getApp().request('/api/todos', { headers: authHeaders() })
    const body2 = await res2.json()
    expect(body2.data).toHaveLength(1)
    expect(body2.data[0].title).toBe('Cached Todo')

    // Verify cache stats show 1 hit
    const statsRes = await server.getApp().request('/api/stats/cache')
    const statsBody = await statsRes.json()
    expect(statsBody.data.enabled).toBe(true)
    expect(statsBody.data.hits).toBeGreaterThanOrEqual(1)
    expect(statsBody.data.size).toBeGreaterThanOrEqual(1)
  })

  it('should invalidate cache on POST (create)', async () => {
    // Populate cache
    await server.getApp().request('/api/todos', { headers: authHeaders() })
    await server.getApp().request('/api/todos', { headers: authHeaders() }) // cache hit

    // Create new todo - should invalidate cache
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'New Todo' })
    })

    // Next list request should reflect the new todo (cache was invalidated)
    const res = await server.getApp().request('/api/todos', { headers: authHeaders() })
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].title).toBe('New Todo')
  })

  it('should invalidate cache on PUT (update)', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Original' })
    })
    const created = await createRes.json()

    // Populate cache with original title
    const before = await server.getApp().request('/api/todos', { headers: authHeaders() })
    expect((await before.json()).data[0].title).toBe('Original')

    // Update - should invalidate cache
    await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Updated' })
    })

    // Next list request should reflect the update
    const after = await server.getApp().request('/api/todos', { headers: authHeaders() })
    const afterBody = await after.json()
    expect(afterBody.data[0].title).toBe('Updated')
  })

  it('should invalidate cache on DELETE', async () => {
    const createRes = await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'To Delete' })
    })
    const created = await createRes.json()

    // Populate cache
    const before = await server.getApp().request('/api/todos', { headers: authHeaders() })
    expect((await before.json()).data).toHaveLength(1)

    // Delete - should invalidate cache
    await server.getApp().request(`/api/todos/${created.data.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    })

    // Next list request should be empty
    const after = await server.getApp().request('/api/todos', { headers: authHeaders() })
    const afterBody = await after.json()
    expect(afterBody.data).toHaveLength(0)
  })

  it('should isolate cache between users', async () => {
    // User1 creates a todo and populates cache
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'User1 Todo' })
    })
    await server.getApp().request('/api/todos', { headers: authHeaders() })

    // Register user2
    const reg2 = await server.getApp().request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cacheuser2', password: 'TestPass99!' })
    })
    const token2 = (await reg2.json()).data.token

    // User2 list - should be empty (separate cache key)
    const res2 = await server.getApp().request('/api/todos', {
      headers: { Authorization: `Bearer ${token2}` }
    })
    const body2 = await res2.json()
    expect(body2.data).toHaveLength(0)

    // User1 list - should still have 1 todo (cache not affected by user2)
    const res1 = await server.getApp().request('/api/todos', { headers: authHeaders() })
    const body1 = await res1.json()
    expect(body1.data).toHaveLength(1)
  })

  it('should clear cache via DELETE /api/stats/cache', async () => {
    // Populate cache
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' })
    })
    await server.getApp().request('/api/todos', { headers: authHeaders() })

    const beforeStats = await server.getApp().request('/api/stats/cache')
    const beforeBody = await beforeStats.json()
    expect(beforeBody.data.size).toBeGreaterThanOrEqual(1)

    // Clear cache
    const clearRes = await server.getApp().request('/api/stats/cache', { method: 'DELETE' })
    expect(clearRes.status).toBe(200)
    const clearBody = await clearRes.json()
    expect(clearBody.data.cleared).toBe(true)

    // Verify size is now 0
    const afterStats = await server.getApp().request('/api/stats/cache')
    const afterBody = await afterStats.json()
    expect(afterBody.data.size).toBe(0)
  })

  it('should report hitRate correctly', async () => {
    await server.getApp().request('/api/todos', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' })
    })
    // 2 misses (list, then list again - second is hit)
    await server.getApp().request('/api/todos', { headers: authHeaders() }) // miss
    await server.getApp().request('/api/todos', { headers: authHeaders() }) // hit

    const statsRes = await server.getApp().request('/api/stats/cache')
    const stats = (await statsRes.json()).data
    expect(stats.hits).toBeGreaterThanOrEqual(1)
    expect(stats.misses).toBeGreaterThanOrEqual(1)
    expect(stats.hitRate).toBeGreaterThan(0)
    expect(stats.hitRate).toBeLessThanOrEqual(100)
  })
})
