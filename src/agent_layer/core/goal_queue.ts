import { randomUUID } from 'node:crypto'
import type { SqliteRepository } from '../../core_layer/data/access/sqlite_repository.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import { NotFoundError } from '../../core_layer/model/errors.js'
import type { IGoalQueue } from '../agent.interface.js'
import type { CreateGoalInput, Goal } from '../model/goal.js'
import { GOAL_PRIORITY_WEIGHT } from '../model/goal_sqlite_config.js'

/**
 * 基于 SQLite 的目标队列实现
 *
 * 目标按优先级权重排序（urgent > high > medium > low），
 * 同优先级按创建时间排序（先入先出）。
 *
 * 当目标被取出执行时，状态变为 in_progress，attempts 递增。
 * 如果尝试次数超过 maxAttempts，目标自动标记为 failed。
 */
export class SqliteGoalQueue implements IGoalQueue {
  constructor(
    private readonly logger: Logger,
    private readonly repo: SqliteRepository<Goal>,
  ) {}

  async add(input: CreateGoalInput): Promise<Goal> {
    const now = new Date()
    const goal: Goal = {
      id: randomUUID(),
      type: input.type,
      description: input.description,
      priority: input.priority ?? 'medium',
      status: 'pending',
      source: input.source ?? 'user',
      triggerCondition: input.triggerCondition,
      maxAttempts: input.maxAttempts ?? 3,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }
    const created = await this.repo.create(goal)
    this.logger.info('Goal added to queue', {
      id: created.id,
      type: created.type,
      description: created.description,
    })
    return created
  }

  async next(): Promise<Goal | null> {
    // 获取所有 pending 目标
    const all = await this.repo.findAll()
    const pending = all.filter((g) => g.status === 'pending')

    if (pending.length === 0) {
      return null
    }

    // 按优先级权重降序，同优先级按创建时间升序
    pending.sort((a, b) => {
      const wDiff =
        GOAL_PRIORITY_WEIGHT[b.priority] - GOAL_PRIORITY_WEIGHT[a.priority]
      if (wDiff !== 0) return wDiff
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

    const nextGoal = pending[0]

    // 检查是否超过最大尝试次数
    if (nextGoal.attempts >= nextGoal.maxAttempts) {
      const failed = await this.repo.update(nextGoal.id, {
        status: 'failed',
        lastResult: `Exceeded max attempts (${nextGoal.maxAttempts})`,
      })
      this.logger.warn('Goal failed (max attempts exceeded)', {
        id: nextGoal.id,
      })
      return failed
    }

    // 标记为进行中，递增尝试次数
    const updated = await this.repo.update(nextGoal.id, {
      status: 'in_progress',
      attempts: nextGoal.attempts + 1,
    })

    this.logger.info('Goal picked for execution', {
      id: updated?.id,
      attempt: updated?.attempts,
    })
    return updated
  }

  async update(id: string, updates: Partial<Goal>): Promise<Goal> {
    // 移除 createdAt/updatedAt，由仓储自动处理
    const { createdAt: _ca, updatedAt: _ua, ...rest } = updates
    void _ca
    void _ua
    const updated = await this.repo.update(id, rest)
    if (!updated) {
      throw new NotFoundError('Goal', id)
    }
    return updated
  }

  async markInProgress(id: string): Promise<Goal> {
    return this.update(id, { status: 'in_progress' })
  }

  async markCompleted(id: string, result?: string): Promise<Goal> {
    return this.update(id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      lastResult: result,
    })
  }

  async markFailed(id: string, error: string): Promise<Goal> {
    return this.update(id, {
      status: 'failed',
      lastResult: error,
    })
  }

  async findAll(): Promise<Goal[]> {
    return this.repo.findAll()
  }

  async pendingCount(): Promise<number> {
    const all = await this.repo.findAll()
    return all.filter((g) => g.status === 'pending').length
  }
}
