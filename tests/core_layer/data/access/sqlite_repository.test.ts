import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import { SqliteRepository } from '../../../../src/core_layer/data/access/sqlite_repository.js'
import { todoSqliteConfig, type Todo } from '../../../../src/core_layer/model/todo.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('SqliteRepository', () => {
  let logger: ConsoleLogger
  let repo: SqliteRepository<Todo>
  let dbPath: string

  beforeEach(() => {
    const mockConfig: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: false },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'sqlite-test')
    dbPath = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    repo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
  })

  afterEach(() => {
    repo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`
    if (existsSync(walPath)) rmSync(walPath)
    if (existsSync(shmPath)) rmSync(shmPath)
  })

  it('should create and retrieve a todo', async () => {
    const created = await repo.create({ userId: 'user-1', title: 'Test Todo', completed: false })
    expect(created.id).toBeDefined()
    expect(created.title).toBe('Test Todo')
    expect(created.completed).toBe(false)
    expect(created.createdAt).toBeInstanceOf(Date)
    expect(created.updatedAt).toBeInstanceOf(Date)

    const found = await repo.findById(created.id)
    expect(found).not.toBeNull()
    expect(found?.title).toBe('Test Todo')
  })

  it('should findAll return all todos', async () => {
    await repo.create({ userId: 'user-1', title: 'Todo 1', completed: false })
    await repo.create({ userId: 'user-1', title: 'Todo 2', completed: true })
    const all = await repo.findAll()
    expect(all).toHaveLength(2)
  })

  it('should update a todo', async () => {
    const created = await repo.create({ userId: 'user-1', title: 'Original', completed: false })
    const updated = await repo.update(created.id, { title: 'Updated', completed: true })
    expect(updated).not.toBeNull()
    expect(updated?.title).toBe('Updated')
    expect(updated?.completed).toBe(true)
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
  })

  it('should return null when updating non-existent todo', async () => {
    const result = await repo.update('non-existent', { title: 'Test' })
    expect(result).toBeNull()
  })

  it('should delete a todo and return true', async () => {
    const created = await repo.create({ userId: 'user-1', title: 'To Delete', completed: false })
    const result = await repo.delete(created.id)
    expect(result).toBe(true)
    const found = await repo.findById(created.id)
    expect(found).toBeNull()
  })

  it('should return false when deleting non-existent todo', async () => {
    const result = await repo.delete('non-existent')
    expect(result).toBe(false)
  })

  it('should persist data across repository instances (restart simulation)', async () => {
    const created = await repo.create({ userId: 'user-1', title: 'Persistent', completed: false })
    repo.close()

    // Create a new repository pointing to the same database file
    const newRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    const all = await newRepo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Persistent')
    expect(all[0].id).toBe(created.id)
    newRepo.close()
  })

  it('should handle concurrent creates without ID collision', async () => {
    const count = 100
    const promises = Array.from({ length: count }, (_, i) =>
      repo.create({ userId: 'user-1', title: `Concurrent ${i}`, completed: false })
    )
    const results = await Promise.all(promises)
    const ids = results.map(r => r.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(count)
  })

  it('should handle partial updates correctly', async () => {
    const created = await repo.create({ userId: 'user-1', title: 'Keep Title', completed: false })
    const updated = await repo.update(created.id, { completed: true })
    expect(updated?.title).toBe('Keep Title')
    expect(updated?.completed).toBe(true)
  })

  it('should preserve createdAt on update', async () => {
    const created = await repo.create({ userId: 'user-1', title: 'Test', completed: false })
    await new Promise(resolve => setTimeout(resolve, 50))
    const updated = await repo.update(created.id, { completed: true })
    expect(updated?.createdAt.getTime()).toBe(created.createdAt.getTime())
  })

  it('should maintain correct boolean serialization', async () => {
    await repo.create({ userId: 'user-1', title: 'True Todo', completed: true })
    await repo.create({ userId: 'user-1', title: 'False Todo', completed: false })
    const all = await repo.findAll()
    const trueTodo = all.find(t => t.title === 'True Todo')
    const falseTodo = all.find(t => t.title === 'False Todo')
    expect(trueTodo?.completed).toBe(true)
    expect(falseTodo?.completed).toBe(false)
  })
})
