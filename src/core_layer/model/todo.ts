import type { SqliteEntityConfig } from '../data/access/sqlite_repository.js'
import type { BaseEntity } from '../data/access/base_repository.js'

/**
 * Todo 优先级
 */
export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent'

/**
 * 所有合法优先级（按权重升序，便于排序）
 */
export const PRIORITY_ORDER: readonly TodoPriority[] = ['low', 'medium', 'high', 'urgent']

/**
 * 将优先级转换为可比较的数字权重
 */
export function priorityWeight(p: TodoPriority | undefined | null): number {
  if (!p) return 1 // 缺省视为 medium
  const idx = PRIORITY_ORDER.indexOf(p)
  return idx === -1 ? 1 : idx
}

/**
 * Todo 实体类型
 */
export interface Todo extends BaseEntity {
  /** 所属用户 ID */
  userId: string
  /** 标题 */
  title: string
  /** 是否完成 */
  completed: boolean
  /** 优先级（缺省 medium） */
  priority: TodoPriority
  /** 截止日期（可空） */
  dueDate: Date | null
  /** 标签列表 */
  tags: string[]
}

/**
 * 用户 Todo 的 SQLite 映射配置
 * - priority: TEXT
 * - dueDate: TEXT (ISO 字符串) / NULL
 * - tags: TEXT (JSON 数组字符串)
 */
export const todoSqliteConfig: SqliteEntityConfig<Todo> = {
  tableName: 'todos',
  columns: [
    { name: 'userId', type: 'TEXT' },
    { name: 'title', type: 'TEXT' },
    { name: 'completed', type: 'INTEGER' },
    { name: 'priority', type: 'TEXT', nullable: true },
    { name: 'dueDate', type: 'TEXT', nullable: true },
    { name: 'tags', type: 'TEXT', nullable: true }
  ],
  fromRow: (row: Record<string, unknown>): Todo => {
    let tags: string[] = []
    if (row.tags !== null && row.tags !== undefined) {
      try {
        const parsed = JSON.parse(row.tags as string)
        if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
      } catch {
        tags = []
      }
    }
    let priority: TodoPriority = 'medium'
    if (typeof row.priority === 'string' && PRIORITY_ORDER.includes(row.priority as TodoPriority)) {
      priority = row.priority as TodoPriority
    }
    let dueDate: Date | null = null
    if (typeof row.dueDate === 'string' && row.dueDate.length > 0) {
      const d = new Date(row.dueDate)
      dueDate = Number.isNaN(d.getTime()) ? null : d
    }
    return {
      id: row.id as string,
      userId: row.userId as string,
      title: row.title as string,
      completed: row.completed === 1,
      priority,
      dueDate,
      tags,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string)
    }
  },
  toValues: (entity: Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>>): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.userId !== undefined) values.userId = entity.userId
    if (entity.title !== undefined) values.title = entity.title
    if (entity.completed !== undefined) values.completed = entity.completed ? 1 : 0
    if (entity.priority !== undefined) values.priority = entity.priority
    if (entity.dueDate !== undefined) {
      values.dueDate = entity.dueDate === null ? null : entity.dueDate.toISOString()
    }
    if (entity.tags !== undefined) values.tags = JSON.stringify(entity.tags)
    return values
  }
}
