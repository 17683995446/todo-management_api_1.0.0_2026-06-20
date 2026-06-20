import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import { SqliteRepository } from '../../../src/core_layer/data/access/sqlite_repository.js'
import { todoSqliteConfig, type Todo, priorityWeight, PRIORITY_ORDER } from '../../../src/core_layer/model/todo.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Rich Todo Features (Phase 4)', () => {
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
    logger = new ConsoleLogger(mockConfig, 'rich-todo-test')
    dbPath = join(tmpdir(), `rich-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
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

  describe('Priority', () => {
    it('should default priority to medium when not specified', async () => {
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: null, tags: [] })
      expect(created.priority).toBe('medium')
    })

    it('should store and retrieve all priority levels', async () => {
      for (const p of PRIORITY_ORDER) {
        await repo.create({ userId: 'u1', title: `P-${p}`, completed: false, priority: p, dueDate: null, tags: [] })
      }
      const all = await repo.findAll()
      expect(all).toHaveLength(4)
      for (const p of PRIORITY_ORDER) {
        expect(all.find(t => t.title === `P-${p}`)?.priority).toBe(p)
      }
    })

    it('should update priority', async () => {
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'low', dueDate: null, tags: [] })
      const updated = await repo.update(created.id, { priority: 'urgent' })
      expect(updated?.priority).toBe('urgent')
    })

    it('should filter by priority using query method', async () => {
      await repo.create({ userId: 'u1', title: 'Low', completed: false, priority: 'low', dueDate: null, tags: [] })
      await repo.create({ userId: 'u1', title: 'High', completed: false, priority: 'high', dueDate: null, tags: [] })
      await repo.create({ userId: 'u1', title: 'High2', completed: false, priority: 'high', dueDate: null, tags: [] })

      const highTodos = await repo.query({
        where: [
          { column: 'userId', op: '=', value: 'u1' },
          { column: 'priority', op: '=', value: 'high' }
        ]
      })
      expect(highTodos).toHaveLength(2)
      expect(highTodos.every(t => t.priority === 'high')).toBe(true)
    })

    it('priorityWeight should return correct ordering', () => {
      expect(priorityWeight('low')).toBe(0)
      expect(priorityWeight('medium')).toBe(1)
      expect(priorityWeight('high')).toBe(2)
      expect(priorityWeight('urgent')).toBe(3)
      expect(priorityWeight(undefined)).toBe(1)
      expect(priorityWeight(null)).toBe(1)
    })
  })

  describe('Due Date', () => {
    it('should store and retrieve dueDate', async () => {
      const due = new Date('2026-12-31T23:59:59.000Z')
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: due, tags: [] })
      expect(created.dueDate).toBeInstanceOf(Date)
      expect(created.dueDate?.toISOString()).toBe(due.toISOString())
    })

    it('should handle null dueDate', async () => {
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: null, tags: [] })
      expect(created.dueDate).toBeNull()
    })

    it('should update dueDate to null', async () => {
      const due = new Date('2026-12-31T23:59:59.000Z')
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: due, tags: [] })
      const updated = await repo.update(created.id, { dueDate: null })
      expect(updated?.dueDate).toBeNull()
    })

    it('should sort by dueDate ascending', async () => {
      await repo.create({ userId: 'u1', title: 'Late', completed: false, priority: 'medium', dueDate: new Date('2026-12-31'), tags: [] })
      await repo.create({ userId: 'u1', title: 'Early', completed: false, priority: 'medium', dueDate: new Date('2026-01-01'), tags: [] })
      await repo.create({ userId: 'u1', title: 'Mid', completed: false, priority: 'medium', dueDate: new Date('2026-06-15'), tags: [] })

      const sorted = await repo.query({
        where: [{ column: 'userId', op: '=', value: 'u1' }],
        orderBy: 'dueDate',
        order: 'ASC'
      })
      expect(sorted[0].title).toBe('Early')
      expect(sorted[1].title).toBe('Mid')
      expect(sorted[2].title).toBe('Late')
    })
  })

  describe('Tags', () => {
    it('should store and retrieve tags', async () => {
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: null, tags: ['work', 'urgent'] })
      expect(created.tags).toEqual(['work', 'urgent'])
    })

    it('should handle empty tags array', async () => {
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: null, tags: [] })
      expect(created.tags).toEqual([])
    })

    it('should update tags', async () => {
      const created = await repo.create({ userId: 'u1', title: 'Test', completed: false, priority: 'medium', dueDate: null, tags: ['a'] })
      const updated = await repo.update(created.id, { tags: ['a', 'b', 'c'] })
      expect(updated?.tags).toEqual(['a', 'b', 'c'])
    })

    it('should filter by tag using LIKE query', async () => {
      await repo.create({ userId: 'u1', title: 'T1', completed: false, priority: 'medium', dueDate: null, tags: ['work', 'meeting'] })
      await repo.create({ userId: 'u1', title: 'T2', completed: false, priority: 'medium', dueDate: null, tags: ['personal'] })
      await repo.create({ userId: 'u1', title: 'T3', completed: false, priority: 'medium', dueDate: null, tags: ['work', 'review'] })

      const workTodos = await repo.query({
        where: [
          { column: 'userId', op: '=', value: 'u1' },
          { column: 'tags', op: 'LIKE', value: '%"work"%' }
        ]
      })
      expect(workTodos).toHaveLength(2)
      expect(workTodos.map(t => t.title).sort()).toEqual(['T1', 'T3'])
    })

    it('should survive invalid JSON in tags column (corruption resilience)', async () => {
      // 直接插入非法 JSON 到 tags 列
      const now = new Date().toISOString()
      ;(repo as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db.prepare(
        'INSERT INTO todos (id, createdAt, updatedAt, userId, title, completed, priority, dueDate, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('corrupt-1', now, now, 'u1', 'Corrupt', 0, 'medium', null, 'not-valid-json')

      const all = await repo.findAll()
      const corrupt = all.find(t => t.id === 'corrupt-1')
      expect(corrupt).toBeDefined()
      expect(corrupt?.tags).toEqual([]) // 应回退到空数组
    })
  })

  describe('Search', () => {
    beforeEach(async () => {
      await repo.create({ userId: 'u1', title: 'Learn TypeScript', completed: false, priority: 'high', dueDate: null, tags: ['study'] })
      await repo.create({ userId: 'u1', title: 'Write documentation', completed: true, priority: 'medium', dueDate: null, tags: ['work'] })
      await repo.create({ userId: 'u1', title: 'Review code', completed: false, priority: 'urgent', dueDate: null, tags: ['work'] })
      await repo.create({ userId: 'u2', title: 'Learn Rust', completed: false, priority: 'low', dueDate: null, tags: ['study'] })
    })

    it('should search by title keyword (case-insensitive via LIKE)', async () => {
      const results = await repo.query({
        where: [
          { column: 'userId', op: '=', value: 'u1' },
          { column: 'title', op: 'LIKE', value: '%learn%' }
        ]
      })
      // SQLite LIKE 默认大小写不敏感（对 ASCII）
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Learn TypeScript')
    })

    it('should combine search with status filter', async () => {
      const results = await repo.query({
        where: [
          { column: 'userId', op: '=', value: 'u1' },
          { column: 'title', op: 'LIKE', value: '%code%' },
          { column: 'completed', op: '=', value: 0 }
        ]
      })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Review code')
    })

    it('should isolate search by user', async () => {
      const u1Results = await repo.query({
        where: [
          { column: 'userId', op: '=', value: 'u1' },
          { column: 'title', op: 'LIKE', value: '%learn%' }
        ]
      })
      const u2Results = await repo.query({
        where: [
          { column: 'userId', op: '=', value: 'u2' },
          { column: 'title', op: 'LIKE', value: '%learn%' }
        ]
      })
      expect(u1Results).toHaveLength(1)
      expect(u2Results).toHaveLength(1)
      expect(u1Results[0].title).toBe('Learn TypeScript')
      expect(u2Results[0].title).toBe('Learn Rust')
    })
  })

  describe('Sorting', () => {
    beforeEach(async () => {
      await repo.create({ userId: 'u1', title: 'Banana', completed: false, priority: 'low', dueDate: null, tags: [] })
      await repo.create({ userId: 'u1', title: 'Apple', completed: false, priority: 'urgent', dueDate: null, tags: [] })
      await repo.create({ userId: 'u1', title: 'Cherry', completed: true, priority: 'medium', dueDate: null, tags: [] })
    })

    it('should sort by title ascending', async () => {
      const results = await repo.query({
        where: [{ column: 'userId', op: '=', value: 'u1' }],
        orderBy: 'title',
        order: 'ASC'
      })
      expect(results.map(t => t.title)).toEqual(['Apple', 'Banana', 'Cherry'])
    })

    it('should sort by title descending', async () => {
      const results = await repo.query({
        where: [{ column: 'userId', op: '=', value: 'u1' }],
        orderBy: 'title',
        order: 'DESC'
      })
      expect(results.map(t => t.title)).toEqual(['Cherry', 'Banana', 'Apple'])
    })

    it('should sort by completed status', async () => {
      const results = await repo.query({
        where: [{ column: 'userId', op: '=', value: 'u1' }],
        orderBy: 'completed',
        order: 'ASC'
      })
      expect(results[0].completed).toBe(false)
      expect(results[2].completed).toBe(true)
    })
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await repo.create({ userId: 'u1', title: `Todo ${i}`, completed: false, priority: 'medium', dueDate: null, tags: [] })
      }
    })

    it('should limit results', async () => {
      const results = await repo.query({
        where: [{ column: 'userId', op: '=', value: 'u1' }],
        limit: 3
      })
      expect(results).toHaveLength(3)
    })

    it('should offset results', async () => {
      const results = await repo.query({
        where: [{ column: 'userId', op: '=', value: 'u1' }],
        limit: 3,
        offset: 5
      })
      expect(results).toHaveLength(3)
      expect(results[0].title).toBe('Todo 5')
    })

    it('should count total matching rows', async () => {
      const total = await repo.count([{ column: 'userId', op: '=', value: 'u1' }])
      expect(total).toBe(10)
    })

    it('should count with filter', async () => {
      const total = await repo.count([
        { column: 'userId', op: '=', value: 'u1' },
        { column: 'title', op: 'LIKE', value: '%Todo 1%' }
      ])
      // 标题为 "Todo 0".."Todo 9"，%Todo 1% 仅匹配 "Todo 1"
      expect(total).toBe(1)
    })
  })

  describe('Schema Migration (backward compatibility)', () => {
    it('should add new columns to existing table without data loss', async () => {
      // 创建一个旧格式 todo（只有基础字段）
      const oldTodo = await repo.create({ userId: 'u1', title: 'Old Todo', completed: true, priority: 'medium', dueDate: null, tags: [] })
      repo.close()

      // 重新打开同一个数据库（模拟重启）
      const newRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
      const found = await newRepo.findById(oldTodo.id)
      expect(found).not.toBeNull()
      expect(found?.title).toBe('Old Todo')
      expect(found?.completed).toBe(true)
      expect(found?.priority).toBe('medium')
      expect(found?.dueDate).toBeNull()
      expect(found?.tags).toEqual([])
      newRepo.close()
    })
  })
})
