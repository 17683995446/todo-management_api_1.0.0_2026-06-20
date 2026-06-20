import type { SqliteEntityConfig } from '../../core_layer/data/access/sqlite_repository.js'
import type {
  Goal,
  GoalPriority,
  GoalSource,
  GoalStatus,
  GoalType,
} from './goal.js'

/**
 * 合法的目标类型
 */
const VALID_TYPES: GoalType[] = [
  'maintenance',
  'optimization',
  'monitoring',
  'self_improvement',
  'user_defined',
]
const VALID_STATUSES: GoalStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]
const VALID_SOURCES: GoalSource[] = [
  'self_generated',
  'user',
  'schedule',
  'reflection',
]
const VALID_PRIORITIES: GoalPriority[] = ['low', 'medium', 'high', 'urgent']

/**
 * 优先级权重映射（用于排序，urgent 最高）
 */
export const GOAL_PRIORITY_WEIGHT: Record<GoalPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
}

/**
 * Goal 的 SQLite 映射配置
 * Goal 继承自 BaseEntity，createdAt/updatedAt 为 Date 类型
 */
export const goalSqliteConfig: SqliteEntityConfig<Goal> = {
  tableName: 'agent_goals',
  columns: [
    { name: 'type', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'priority', type: 'TEXT' },
    { name: 'status', type: 'TEXT' },
    { name: 'source', type: 'TEXT' },
    { name: 'triggerCondition', type: 'TEXT', nullable: true },
    { name: 'maxAttempts', type: 'INTEGER' },
    { name: 'attempts', type: 'INTEGER' },
    { name: 'completedAt', type: 'TEXT', nullable: true },
    { name: 'lastResult', type: 'TEXT', nullable: true },
  ],
  fromRow: (row: Record<string, unknown>): Goal => {
    const type = VALID_TYPES.includes(row.type as GoalType)
      ? (row.type as GoalType)
      : 'user_defined'
    const status = VALID_STATUSES.includes(row.status as GoalStatus)
      ? (row.status as GoalStatus)
      : 'pending'
    const source = VALID_SOURCES.includes(row.source as GoalSource)
      ? (row.source as GoalSource)
      : 'user'
    const priority = VALID_PRIORITIES.includes(row.priority as GoalPriority)
      ? (row.priority as GoalPriority)
      : 'medium'

    return {
      id: row.id as string,
      type,
      description: row.description as string,
      priority,
      status,
      source,
      triggerCondition: (row.triggerCondition as string) || undefined,
      maxAttempts: typeof row.maxAttempts === 'number' ? row.maxAttempts : 3,
      attempts: typeof row.attempts === 'number' ? row.attempts : 0,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
      completedAt: (row.completedAt as string) || undefined,
      lastResult: (row.lastResult as string) || undefined,
    }
  },
  toValues: (
    entity: Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.type !== undefined) values.type = entity.type
    if (entity.description !== undefined)
      values.description = entity.description
    if (entity.priority !== undefined) values.priority = entity.priority
    if (entity.status !== undefined) values.status = entity.status
    if (entity.source !== undefined) values.source = entity.source
    if (entity.triggerCondition !== undefined)
      values.triggerCondition = entity.triggerCondition
    if (entity.maxAttempts !== undefined)
      values.maxAttempts = entity.maxAttempts
    if (entity.attempts !== undefined) values.attempts = entity.attempts
    if (entity.completedAt !== undefined)
      values.completedAt = entity.completedAt
    if (entity.lastResult !== undefined) values.lastResult = entity.lastResult
    return values
  },
}
