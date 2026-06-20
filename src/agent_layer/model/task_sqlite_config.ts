import type { SqliteEntityConfig } from '../../core_layer/data/access/sqlite_repository.js'
import type { Task, TaskPriority, TaskStatus } from './task.js'
import type { Milestone } from './task.js'

const VALID_TASK_STATUSES: TaskStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'blocked',
]
const VALID_TASK_PRIORITIES: TaskPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
]

/**
 * Task 的 SQLite 映射配置
 * subtaskIds 数组序列化为 JSON 字符串存储。
 */
export const taskSqliteConfig: SqliteEntityConfig<Task> = {
  tableName: 'agent_tasks',
  columns: [
    { name: 'parentGoalId', type: 'TEXT' },
    { name: 'parentTaskId', type: 'TEXT', nullable: true },
    { name: 'title', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'status', type: 'TEXT' },
    { name: 'priority', type: 'TEXT' },
    { name: 'assignedAgentId', type: 'TEXT', nullable: true },
    { name: 'subtaskIds', type: 'TEXT' },
    { name: 'sortOrder', type: 'INTEGER' },
    { name: 'result', type: 'TEXT', nullable: true },
    { name: 'checkpoint', type: 'TEXT', nullable: true },
    { name: 'failureReason', type: 'TEXT', nullable: true },
  ],
  fromRow: (row: Record<string, unknown>): Task => {
    const status = VALID_TASK_STATUSES.includes(row.status as TaskStatus)
      ? (row.status as TaskStatus)
      : 'pending'
    const priority = VALID_TASK_PRIORITIES.includes(
      row.priority as TaskPriority,
    )
      ? (row.priority as TaskPriority)
      : 'medium'

    let subtaskIds: string[] = []
    try {
      const parsed = JSON.parse(row.subtaskIds as string)
      if (Array.isArray(parsed)) {
        subtaskIds = parsed
      }
    } catch {
      subtaskIds = []
    }

    return {
      id: row.id as string,
      parentGoalId: row.parentGoalId as string,
      parentTaskId: (row.parentTaskId as string) || undefined,
      title: row.title as string,
      description: row.description as string,
      status,
      priority,
      assignedAgentId: (row.assignedAgentId as string) || undefined,
      subtaskIds,
      order: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
      result: (row.result as string) || undefined,
      checkpoint: (row.checkpoint as string) || undefined,
      failureReason: (row.failureReason as string) || undefined,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  },
  toValues: (
    entity: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.parentGoalId !== undefined)
      values.parentGoalId = entity.parentGoalId
    if (entity.parentTaskId !== undefined)
      values.parentTaskId = entity.parentTaskId
    if (entity.title !== undefined) values.title = entity.title
    if (entity.description !== undefined)
      values.description = entity.description
    if (entity.status !== undefined) values.status = entity.status
    if (entity.priority !== undefined) values.priority = entity.priority
    if (entity.assignedAgentId !== undefined)
      values.assignedAgentId = entity.assignedAgentId
    if (entity.subtaskIds !== undefined)
      values.subtaskIds = JSON.stringify(entity.subtaskIds)
    if (entity.order !== undefined) values.sortOrder = entity.order
    if (entity.result !== undefined) values.result = entity.result
    if (entity.checkpoint !== undefined) values.checkpoint = entity.checkpoint
    if (entity.failureReason !== undefined)
      values.failureReason = entity.failureReason
    return values
  },
}

/**
 * Milestone 的 SQLite 映射配置
 * Milestone 不继承 BaseEntity（使用简单 id），单独管理。
 */
export const milestoneSqliteConfig: SqliteEntityConfig<
  Milestone & { id: string; createdAt: Date; updatedAt: Date }
> = {
  tableName: 'agent_milestones',
  columns: [
    { name: 'taskId', type: 'TEXT' },
    { name: 'title', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'completed', type: 'BOOLEAN' },
    { name: 'completedAt', type: 'TEXT', nullable: true },
    { name: 'sortOrder', type: 'INTEGER' },
  ],
  fromRow: (
    row: Record<string, unknown>,
  ): Milestone & { id: string; createdAt: Date; updatedAt: Date } => {
    return {
      id: row.id as string,
      taskId: row.taskId as string,
      title: row.title as string,
      description: row.description as string,
      completed: Boolean(row.completed),
      completedAt: (row.completedAt as string) || undefined,
      order: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  },
  toValues: (
    entity: Partial<
      Omit<
        Milestone & { id: string; createdAt: Date; updatedAt: Date },
        'id' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.taskId !== undefined) values.taskId = entity.taskId
    if (entity.title !== undefined) values.title = entity.title
    if (entity.description !== undefined)
      values.description = entity.description
    if (entity.completed !== undefined)
      values.completed = entity.completed ? 1 : 0
    if (entity.completedAt !== undefined)
      values.completedAt = entity.completedAt
    if (entity.order !== undefined) values.sortOrder = entity.order
    return values
  },
}
