import type { SqliteEntityConfig } from '../data/access/sqlite_repository.js'
import type { BaseEntity } from '../data/access/base_repository.js'

/**
 * 用户实体类型
 */
export interface User extends BaseEntity {
  /** 用户名（唯一） */
  username: string
  /** 密码哈希 */
  passwordHash: string
  /** 显示名称 */
  displayName: string
}

/**
 * 用户实体的 SQLite 映射配置
 */
export const userSqliteConfig: SqliteEntityConfig<User> = {
  tableName: 'users',
  columns: [
    { name: 'username', type: 'TEXT' },
    { name: 'passwordHash', type: 'TEXT' },
    { name: 'displayName', type: 'TEXT' }
  ],
  fromRow: (row: Record<string, unknown>): User => ({
    id: row.id as string,
    username: row.username as string,
    passwordHash: row.passwordHash as string,
    displayName: row.displayName as string,
    createdAt: new Date(row.createdAt as string),
    updatedAt: new Date(row.updatedAt as string)
  }),
  toValues: (entity: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.username !== undefined) values.username = entity.username
    if (entity.passwordHash !== undefined) values.passwordHash = entity.passwordHash
    if (entity.displayName !== undefined) values.displayName = entity.displayName
    return values
  }
}
