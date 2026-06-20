import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TaskPlanner } from '../../src/agent_layer/enhancement/task_planner.js'
import type { Milestone, Task } from '../../src/agent_layer/model/task.js'
import {
  milestoneSqliteConfig,
  taskSqliteConfig,
} from '../../src/agent_layer/model/task_sqlite_config.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

type MilestoneRow = Milestone & { id: string; createdAt: Date; updatedAt: Date }

describe('TaskPlanner', () => {
  let logger: ConsoleLogger
  let taskRepo: SqliteRepository<Task>
  let milestoneRepo: SqliteRepository<MilestoneRow>
  let planner: TaskPlanner
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
    logger = new ConsoleLogger(config, 'planner-test')
    dbPath = join(
      tmpdir(),
      `test-planner-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    taskRepo = new SqliteRepository<Task>(logger, dbPath, taskSqliteConfig)
    milestoneRepo = new SqliteRepository<MilestoneRow>(
      logger,
      dbPath,
      milestoneSqliteConfig,
    )
    planner = new TaskPlanner(logger, taskRepo, milestoneRepo)
  })

  afterEach(() => {
    taskRepo.close()
    milestoneRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should decompose a goal into multiple subtasks', async () => {
    const tasks = await planner.plan(
      'goal-1',
      'clean up data and optimize performance',
    )

    expect(tasks.length).toBeGreaterThanOrEqual(2)
    expect(tasks.some((t) => t.title.includes('清理'))).toBe(true)
    expect(tasks.some((t) => t.title.includes('优化'))).toBe(true)
  })

  it('should create tasks with sequential order', async () => {
    const tasks = await planner.plan(
      'goal-1',
      'monitor system and generate report',
    )

    for (let i = 0; i < tasks.length; i++) {
      expect(tasks[i].order).toBe(i)
    }
  })

  it('should add verification task when only one pattern matches', async () => {
    const tasks = await planner.plan('goal-1', 'run health check')

    expect(tasks.length).toBe(2)
    expect(tasks[1].title).toBe('验证结果')
  })

  it('should create generic task when no pattern matches', async () => {
    const tasks = await planner.plan('goal-1', 'do something unusual')

    expect(tasks.length).toBeGreaterThanOrEqual(1)
    expect(tasks[0].title).toContain('do something unusual')
  })

  it('should add a subtask and link to parent', async () => {
    const parent = await taskRepo.create({
      parentGoalId: 'g1',
      parentTaskId: undefined,
      title: 'parent',
      description: 'd',
      status: 'pending',
      priority: 'medium',
      assignedAgentId: undefined,
      subtaskIds: [],
      order: 0,
      result: undefined,
      checkpoint: undefined,
      failureReason: undefined,
    })

    const child = await planner.addTask({
      parentGoalId: 'g1',
      parentTaskId: parent.id,
      title: 'child',
      description: 'child task',
    })

    expect(child.parentTaskId).toBe(parent.id)

    // Parent should have child in subtaskIds
    const updatedParent = await taskRepo.findById(parent.id)
    expect(updatedParent?.subtaskIds).toContain(child.id)
  })

  it('should get task tree recursively', async () => {
    const root = await taskRepo.create({
      parentGoalId: 'g1',
      parentTaskId: undefined,
      title: 'root',
      description: 'd',
      status: 'pending',
      priority: 'medium',
      assignedAgentId: undefined,
      subtaskIds: [],
      order: 0,
      result: undefined,
      checkpoint: undefined,
      failureReason: undefined,
    })

    const child1 = await planner.addTask({
      parentGoalId: 'g1',
      parentTaskId: root.id,
      title: 'child1',
      description: 'd',
    })
    const child2 = await planner.addTask({
      parentGoalId: 'g1',
      parentTaskId: root.id,
      title: 'child2',
      description: 'd',
    })

    // Add grandchild
    await planner.addTask({
      parentGoalId: 'g1',
      parentTaskId: child1.id,
      title: 'grandchild',
      description: 'd',
    })

    const tree = await planner.getTaskTree(root.id)
    expect(tree.length).toBe(4) // root + 2 children + 1 grandchild
    expect(tree.some((t) => t.title === 'root')).toBe(true)
    expect(tree.some((t) => t.title === 'grandchild')).toBe(true)
  })

  it('should get tasks by goal', async () => {
    await planner.plan('goal-A', 'clean and optimize')
    await planner.plan('goal-B', 'monitor and report')

    const tasksA = await planner.getTasksByGoal('goal-A')
    const tasksB = await planner.getTasksByGoal('goal-B')

    expect(tasksA.length).toBeGreaterThan(0)
    expect(tasksB.length).toBeGreaterThan(0)
    expect(tasksA.every((t) => t.parentGoalId === 'goal-A')).toBe(true)
  })

  it('should find next executable task (first pending by order)', async () => {
    const tasks = await planner.plan('g1', 'clean and optimize')

    const next = await planner.nextExecutable('g1')
    expect(next).not.toBeNull()
    expect(next?.id).toBe(tasks[0].id)
    expect(next?.status).toBe('pending')
  })

  it('should skip completed tasks when finding next executable', async () => {
    const tasks = await planner.plan('g1', 'clean and optimize')

    // Complete first task
    await planner.updateTaskStatus(tasks[0].id, 'completed', 'done')

    const next = await planner.nextExecutable('g1')
    expect(next?.id).toBe(tasks[1].id)
  })

  it('should return null when all tasks completed', async () => {
    const tasks = await planner.plan('g1', 'clean and optimize')
    for (const t of tasks) {
      await planner.updateTaskStatus(t.id, 'completed')
    }

    const next = await planner.nextExecutable('g1')
    expect(next).toBeNull()
  })

  it('should update task status', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const updated = await planner.updateTaskStatus(tasks[0].id, 'in_progress')

    expect(updated.status).toBe('in_progress')
  })

  it('should update task status with result', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const updated = await planner.updateTaskStatus(
      tasks[0].id,
      'completed',
      'all good',
    )

    expect(updated.status).toBe('completed')
    expect(updated.result).toBe('all good')
  })

  it('should set failure reason on failed status', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const updated = await planner.updateTaskStatus(
      tasks[0].id,
      'failed',
      'connection lost',
    )

    expect(updated.status).toBe('failed')
    expect(updated.failureReason).toBe('connection lost')
  })

  it('should save and restore checkpoint', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const checkpoint = JSON.stringify({ step: 3, data: 'partial' })

    await planner.saveCheckpoint(tasks[0].id, checkpoint)
    const restored = await planner.restoreCheckpoint(tasks[0].id)

    expect(restored).toBe(checkpoint)
  })

  it('should return null checkpoint when none saved', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const restored = await planner.restoreCheckpoint(tasks[0].id)
    expect(restored).toBeNull()
  })

  it('should calculate progress correctly', async () => {
    const tasks = await planner.plan('g1', 'clean and optimize and monitor')
    expect(tasks.length).toBeGreaterThanOrEqual(3)

    // Complete first task
    await planner.updateTaskStatus(tasks[0].id, 'completed')
    // Fail second task
    await planner.updateTaskStatus(tasks[1].id, 'failed', 'error')
    // Third still pending

    const progress = await planner.getProgress('g1')
    expect(progress.totalTasks).toBe(tasks.length)
    expect(progress.completedTasks).toBe(1)
    expect(progress.failedTasks).toBe(1)
    expect(progress.completionRate).toBeCloseTo(1 / tasks.length)
  })

  it('should handle empty goal progress', async () => {
    const progress = await planner.getProgress('empty-goal')
    expect(progress.totalTasks).toBe(0)
    expect(progress.completionRate).toBe(0)
  })

  it('should add milestone to task', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const milestone = await planner.addMilestone(
      tasks[0].id,
      'Phase 1',
      'First phase complete',
    )

    expect(milestone.id).toBeDefined()
    expect(milestone.taskId).toBe(tasks[0].id)
    expect(milestone.title).toBe('Phase 1')
    expect(milestone.completed).toBe(false)
    expect(milestone.order).toBe(0)
  })

  it('should complete milestone', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    const milestone = await planner.addMilestone(tasks[0].id, 'M1', 'desc')

    const completed = await planner.completeMilestone(milestone.id)
    expect(completed.completed).toBe(true)
    expect(completed.completedAt).toBeDefined()
  })

  it('should get milestones for task ordered by order', async () => {
    const tasks = await planner.plan('g1', 'monitor system')
    await planner.addMilestone(tasks[0].id, 'M2', 'd2')
    await planner.addMilestone(tasks[0].id, 'M1', 'd1')

    const milestones = await planner.getMilestones(tasks[0].id)
    expect(milestones).toHaveLength(2)
    expect(milestones[0].order).toBe(0)
    expect(milestones[1].order).toBe(1)
  })

  it('should persist tasks across instances (SQLite)', async () => {
    const tasks = await planner.plan('g1', 'clean and optimize')
    await planner.updateTaskStatus(tasks[0].id, 'completed', 'done')

    // Create new planner with same DB
    const newTaskRepo = new SqliteRepository<Task>(
      logger,
      dbPath,
      taskSqliteConfig,
    )
    const newMilestoneRepo = new SqliteRepository<MilestoneRow>(
      logger,
      dbPath,
      milestoneSqliteConfig,
    )
    const newPlanner = new TaskPlanner(logger, newTaskRepo, newMilestoneRepo)

    const restored = await newPlanner.getTasksByGoal('g1')
    expect(restored.length).toBe(tasks.length)
    expect(restored[0].status).toBe('completed')
    expect(restored[0].result).toBe('done')

    newTaskRepo.close()
    newMilestoneRepo.close()
  })

  it('should enforce sequential execution via order', async () => {
    // Create 3 tasks with order 0, 1, 2
    const t0 = await planner.addTask({
      parentGoalId: 'g1',
      title: 't0',
      description: 'd',
      order: 0,
    })
    const t1 = await planner.addTask({
      parentGoalId: 'g1',
      title: 't1',
      description: 'd',
      order: 1,
    })
    await planner.addTask({
      parentGoalId: 'g1',
      title: 't2',
      description: 'd',
      order: 2,
    })

    // First executable should be t0
    const next1 = await planner.nextExecutable('g1')
    expect(next1?.id).toBe(t0.id)

    // Complete t0
    await planner.updateTaskStatus(t0.id, 'completed')

    // Now t1 should be executable
    const next2 = await planner.nextExecutable('g1')
    expect(next2?.id).toBe(t1.id)

    // t1 not completed yet, so t2 should NOT be executable
    await planner.updateTaskStatus(t1.id, 'in_progress')
    const next3 = await planner.nextExecutable('g1')
    expect(next3).toBeNull() // t2 blocked because t1 not completed
  })
})
