import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteGoalQueue } from '../../src/agent_layer/core/goal_queue.js'
import type { Goal } from '../../src/agent_layer/model/goal.js'
import { goalSqliteConfig } from '../../src/agent_layer/model/goal_sqlite_config.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('SqliteGoalQueue', () => {
  let logger: ConsoleLogger
  let repo: SqliteRepository<Goal>
  let queue: SqliteGoalQueue
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
    logger = new ConsoleLogger(config, 'goal-queue-test')
    dbPath = join(
      tmpdir(),
      `test-goal-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    repo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
    queue = new SqliteGoalQueue(logger, repo)
  })

  afterEach(() => {
    repo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should add a goal with defaults', async () => {
    const goal = await queue.add({
      type: 'maintenance',
      description: 'Clean up old logs',
    })
    expect(goal.id).toBeDefined()
    expect(goal.type).toBe('maintenance')
    expect(goal.description).toBe('Clean up old logs')
    expect(goal.priority).toBe('medium')
    expect(goal.status).toBe('pending')
    expect(goal.source).toBe('user')
    expect(goal.maxAttempts).toBe(3)
    expect(goal.attempts).toBe(0)
  })

  it('should add a goal with custom values', async () => {
    const goal = await queue.add({
      type: 'optimization',
      description: 'Optimize cache',
      priority: 'urgent',
      source: 'self_generated',
      maxAttempts: 5,
      triggerCondition: 'cacheHitRate < 0.5',
    })
    expect(goal.priority).toBe('urgent')
    expect(goal.source).toBe('self_generated')
    expect(goal.maxAttempts).toBe(5)
    expect(goal.triggerCondition).toBe('cacheHitRate < 0.5')
  })

  it('should return null when no pending goals', async () => {
    const next = await queue.next()
    expect(next).toBeNull()
  })

  it('should return next goal by priority (urgent first)', async () => {
    await queue.add({
      type: 'maintenance',
      description: 'low task',
      priority: 'low',
    })
    await queue.add({
      type: 'maintenance',
      description: 'urgent task',
      priority: 'urgent',
    })
    await queue.add({
      type: 'maintenance',
      description: 'medium task',
      priority: 'medium',
    })

    const next = await queue.next()
    expect(next).not.toBeNull()
    expect(next?.description).toBe('urgent task')
    expect(next?.status).toBe('in_progress')
    expect(next?.attempts).toBe(1)
  })

  it('should return goals with same priority in FIFO order', async () => {
    await queue.add({ type: 'maintenance', description: 'first' })
    await queue.add({ type: 'maintenance', description: 'second' })

    const first = await queue.next()
    expect(first?.description).toBe('first')

    const second = await queue.next()
    expect(second?.description).toBe('second')
  })

  it('should skip in_progress goals when getting next', async () => {
    await queue.add({ type: 'maintenance', description: 'task A' })
    await queue.add({ type: 'maintenance', description: 'task B' })

    const first = await queue.next()
    expect(first?.description).toBe('task A')
    expect(first?.status).toBe('in_progress')

    // task A is in_progress, should get task B
    const second = await queue.next()
    expect(second?.description).toBe('task B')
  })

  it('should mark goal as completed', async () => {
    const goal = await queue.add({
      type: 'monitoring',
      description: 'check health',
    })
    await queue.markCompleted(goal.id, 'All systems healthy')

    const all = await queue.findAll()
    const found = all.find((g) => g.id === goal.id)
    expect(found?.status).toBe('completed')
    expect(found?.completedAt).toBeDefined()
    expect(found?.lastResult).toBe('All systems healthy')
  })

  it('should mark goal as failed', async () => {
    const goal = await queue.add({
      type: 'optimization',
      description: 'optimize DB',
    })
    await queue.markFailed(goal.id, 'Connection timeout')

    const all = await queue.findAll()
    const found = all.find((g) => g.id === goal.id)
    expect(found?.status).toBe('failed')
    expect(found?.lastResult).toBe('Connection timeout')
  })

  it('should auto-fail goal when max attempts exceeded', async () => {
    const goal = await queue.add({
      type: 'maintenance',
      description: 'flaky task',
      maxAttempts: 2,
    })

    // First attempt
    const attempt1 = await queue.next()
    expect(attempt1?.id).toBe(goal.id)
    expect(attempt1?.attempts).toBe(1)
    await queue.markFailed(goal.id, 'failed once')

    // Reset to pending for retry
    await queue.update(goal.id, { status: 'pending' })

    // Second attempt
    const attempt2 = await queue.next()
    expect(attempt2?.attempts).toBe(2)
    await queue.markFailed(goal.id, 'failed twice')

    // Reset to pending for retry
    await queue.update(goal.id, { status: 'pending' })

    // Third call: attempts (2) >= maxAttempts (2), should auto-fail
    const attempt3 = await queue.next()
    expect(attempt3).not.toBeNull()
    expect(attempt3?.status).toBe('failed')
    expect(attempt3?.lastResult).toContain('Exceeded max attempts')
  })

  it('should count pending goals', async () => {
    expect(await queue.pendingCount()).toBe(0)

    await queue.add({ type: 'maintenance', description: 'task 1' })
    await queue.add({ type: 'maintenance', description: 'task 2' })
    expect(await queue.pendingCount()).toBe(2)

    await queue.next() // marks one as in_progress
    expect(await queue.pendingCount()).toBe(1)
  })

  it('should find all goals', async () => {
    await queue.add({ type: 'maintenance', description: 'task 1' })
    await queue.add({ type: 'optimization', description: 'task 2' })

    const all = await queue.findAll()
    expect(all).toHaveLength(2)
    expect(all.map((g) => g.description).sort()).toEqual(['task 1', 'task 2'])
  })

  it('should persist goals across instances', async () => {
    await queue.add({ type: 'maintenance', description: 'persistent task' })

    // Create a new queue instance with the same DB
    const newRepo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
    const newQueue = new SqliteGoalQueue(logger, newRepo)

    const all = await newQueue.findAll()
    expect(all).toHaveLength(1)
    expect(all[0].description).toBe('persistent task')

    newRepo.close()
  })
})
