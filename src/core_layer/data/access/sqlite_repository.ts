import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import type { Logger } from '../../logic/logger.js'
import { AppError, ErrorCode } from '../../model/errors.js'
import { type BaseEntity, BaseRepository } from './base_repository.js'

/**
 * SQLite 仓储的序列化配置
 * 描述如何将实体映射到数据库表
 */
export interface SqliteEntityConfig<T extends BaseEntity> {
  /** 表名 */
  tableName: string
  /** 列定义（不含 id/createdAt/updatedAt，这些由基类管理） */
  columns: ReadonlyArray<{
    name: string
    type: 'TEXT' | 'INTEGER' | 'REAL' | 'BOOLEAN'
    nullable?: boolean
  }>
  /** 从数据库行映射到实体 */
  fromRow: (row: Record<string, unknown>) => T
  /** 从实体映射到可插入的列值（不含 id/createdAt/updatedAt） */
  toValues: (
    entity: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
  ) => Record<string, unknown>
}

/**
 * 基于 SQLite 的持久化仓储实现
 * 数据在进程重启后仍然保留
 */
export class SqliteRepository<T extends BaseEntity> extends BaseRepository<T> {
  private readonly db: DatabaseType
  private readonly config: SqliteEntityConfig<T>
  private readonly allColumns: string[]

  constructor(logger: Logger, dbPath: string, config: SqliteEntityConfig<T>) {
    super(logger)
    // 自动创建数据库文件的父目录（与 better-sqlite3 自动创建文件的行为一致）
    const dir = dirname(dbPath)
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.config = config
    this.allColumns = [
      'id',
      'createdAt',
      'updatedAt',
      ...config.columns.map((c) => c.name),
    ]
    this.ensureTable()
    this.logger.trace(
      'SqliteRepository initialized',
      { dbPath, table: config.tableName },
      42,
      'constructor',
    )
  }

  /**
   * 确保表存在，并对已存在的表补齐缺失列（轻量级迁移）
   */
  private ensureTable(): void {
    const columnDefs = [
      'id TEXT PRIMARY KEY',
      'createdAt TEXT NOT NULL',
      'updatedAt TEXT NOT NULL',
      ...this.config.columns.map((c) => {
        const nullable = c.nullable ? '' : ' NOT NULL'
        return `${c.name} ${c.type}${nullable}`
      }),
    ]
    const sql = `CREATE TABLE IF NOT EXISTS ${this.config.tableName} (${columnDefs.join(', ')})`
    this.db.exec(sql)

    // 对已存在的表补齐缺失列（CREATE TABLE IF NOT EXISTS 不会添加新列）
    const existingCols = this.db
      .prepare(`PRAGMA table_info(${this.config.tableName})`)
      .all() as Array<{ name: string }>
    const existingNames = new Set(existingCols.map((c) => c.name))
    for (const col of this.config.columns) {
      if (!existingNames.has(col.name)) {
        const nullable = col.nullable ? '' : ' NOT NULL'
        const defaultVal = col.nullable ? '' : " DEFAULT ''"
        this.db.exec(
          `ALTER TABLE ${this.config.tableName} ADD COLUMN ${col.name} ${col.type}${nullable}${defaultVal}`,
        )
        this.logger.trace(
          'Column migrated',
          { table: this.config.tableName, column: col.name },
          64,
          'ensureTable',
        )
      }
    }
    this.logger.trace(
      'Table ensured',
      { table: this.config.tableName },
      65,
      'ensureTable',
    )
  }

  /**
   * 将 Date 序列化为 ISO 字符串
   */
  private serializeDate(date: Date): string {
    return date.toISOString()
  }

  /**
   * 将 ISO 字符串反序列化为 Date
   */
  private deserializeDate(value: string): Date {
    return new Date(value)
  }

  async findAll(): Promise<T[]> {
    this.logger.trace('SqliteRepository.findAll called', {}, 73, 'findAll')
    const sql = `SELECT * FROM ${this.config.tableName} ORDER BY createdAt ASC`
    const rows = this.db.prepare(sql).all() as Record<string, unknown>[]
    const result = rows.map((row) => this.config.fromRow(row))
    this.logger.trace(
      'SqliteRepository.findAll returning',
      { count: result.length },
      77,
      'findAll',
    )
    return result
  }

  async findById(id: string): Promise<T | null> {
    this.logger.trace(
      'SqliteRepository.findById called',
      { id },
      82,
      'findById',
    )
    const sql = `SELECT * FROM ${this.config.tableName} WHERE id = ?`
    const row = this.db.prepare(sql).get(id) as
      | Record<string, unknown>
      | undefined
    if (!row) {
      this.logger.trace(
        'SqliteRepository.findById: not found',
        { id },
        86,
        'findById',
      )
      return null
    }
    return this.config.fromRow(row)
  }

  async create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    this.logger.trace('SqliteRepository.create called', {}, 93, 'create')
    const now = new Date()
    const id = randomUUID()
    const values = this.config.toValues(entity)
    const allValues: Record<string, unknown> = {
      id,
      createdAt: this.serializeDate(now),
      updatedAt: this.serializeDate(now),
      ...values,
    }
    const columns = this.allColumns.join(', ')
    const placeholders = this.allColumns.map(() => '?').join(', ')
    const sql = `INSERT INTO ${this.config.tableName} (${columns}) VALUES (${placeholders})`
    this.db.prepare(sql).run(...this.allColumns.map((c) => allValues[c]))
    this.logger.trace(
      'SqliteRepository.create returning',
      { id },
      104,
      'create',
    )

    // 返回完整实体
    const created = await this.findById(id)
    if (!created) {
      throw new AppError(
        'Failed to retrieve created entity',
        ErrorCode.INTERNAL_ERROR,
      )
    }
    return created
  }

  async update(
    id: string,
    updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<T | null> {
    this.logger.trace('SqliteRepository.update called', { id }, 114, 'update')
    const existing = await this.findById(id)
    if (!existing) {
      this.logger.trace(
        'SqliteRepository.update: not found',
        { id },
        118,
        'update',
      )
      return null
    }

    const values = this.config.toValues(updates)
    const updateColumns = Object.keys(values)
    if (updateColumns.length === 0) {
      return existing
    }

    const setClauses = [
      ...updateColumns.map((c) => `${c} = ?`),
      'updatedAt = ?',
    ]
    const setValues = [
      ...updateColumns.map((c) => values[c]),
      this.serializeDate(new Date()),
    ]
    const sql = `UPDATE ${this.config.tableName} SET ${setClauses.join(', ')} WHERE id = ?`
    this.db.prepare(sql).run(...setValues, id)
    this.logger.trace(
      'SqliteRepository.update returning',
      { id },
      130,
      'update',
    )

    return this.findById(id)
  }

  async delete(id: string): Promise<boolean> {
    this.logger.trace('SqliteRepository.delete called', { id }, 136, 'delete')
    const sql = `DELETE FROM ${this.config.tableName} WHERE id = ?`
    const result = this.db.prepare(sql).run(id)
    const deleted = result.changes > 0
    this.logger.trace(
      'SqliteRepository.delete returning',
      { deleted },
      141,
      'delete',
    )
    return deleted
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.logger.trace('SqliteRepository.close called', {}, 149, 'close')
    this.db.close()
  }

  /**
   * 按列值过滤查询
   * @param filters - 列名到值的映射
   * @returns 匹配的实体数组
   */
  async findAllFiltered(filters: Record<string, unknown>): Promise<T[]> {
    this.logger.trace(
      'SqliteRepository.findAllFiltered called',
      { filters },
      159,
      'findAllFiltered',
    )
    const entries = Object.entries(filters)
    if (entries.length === 0) {
      return this.findAll()
    }
    const whereClause = entries.map(([key]) => `${key} = ?`).join(' AND ')
    const sql = `SELECT * FROM ${this.config.tableName} WHERE ${whereClause} ORDER BY createdAt ASC`
    const rows = this.db
      .prepare(sql)
      .all(...entries.map(([, value]) => value)) as Record<string, unknown>[]
    const result = rows.map((row) => this.config.fromRow(row))
    this.logger.trace(
      'SqliteRepository.findAllFiltered returning',
      { count: result.length },
      167,
      'findAllFiltered',
    )
    return result
  }

  /**
   * 高级查询：支持等值过滤、LIKE 搜索、排序
   * 所有条件均以 AND 组合
   * @param opts - 查询选项
   * @returns 匹配的实体数组
   */
  async query(opts: {
    where?: Array<{ column: string; op: '=' | 'LIKE'; value: unknown }>
    orderBy?: string
    order?: 'ASC' | 'DESC'
    limit?: number
    offset?: number
  }): Promise<T[]> {
    this.logger.trace('SqliteRepository.query called', { opts }, 172, 'query')
    const conditions = opts.where ?? []
    const whereClause =
      conditions.length > 0
        ? ` WHERE ${conditions.map((c) => `${c.column} ${c.op} ?`).join(' AND ')}`
        : ''
    const orderByClause = opts.orderBy
      ? ` ORDER BY ${opts.orderBy} ${opts.order ?? 'ASC'}`
      : ' ORDER BY createdAt ASC'
    // SQLite 要求 OFFSET 必须配合 LIMIT；当只指定 offset 时使用 LIMIT -1 表示无上限
    let limitClause = ''
    if (opts.limit !== undefined) {
      limitClause = ` LIMIT ${opts.limit}`
    } else if (opts.offset !== undefined && opts.offset > 0) {
      limitClause = ' LIMIT -1'
    }
    const offsetClause =
      opts.offset !== undefined && opts.offset > 0
        ? ` OFFSET ${opts.offset}`
        : ''
    const sql = `SELECT * FROM ${this.config.tableName}${whereClause}${orderByClause}${limitClause}${offsetClause}`
    const params = conditions.map((c) => c.value)
    const rows = this.db.prepare(sql).all(...params) as Record<
      string,
      unknown
    >[]
    const result = rows.map((row) => this.config.fromRow(row))
    this.logger.trace(
      'SqliteRepository.query returning',
      { count: result.length },
      186,
      'query',
    )
    return result
  }

  /**
   * 统计满足条件的行数
   */
  async count(
    where?: Array<{ column: string; op: '=' | 'LIKE'; value: unknown }>,
  ): Promise<number> {
    this.logger.trace('SqliteRepository.count called', { where }, 188, 'count')
    const conditions = where ?? []
    const whereClause =
      conditions.length > 0
        ? ` WHERE ${conditions.map((c) => `${c.column} ${c.op} ?`).join(' AND ')}`
        : ''
    const sql = `SELECT COUNT(*) as cnt FROM ${this.config.tableName}${whereClause}`
    const params = conditions.map((c) => c.value)
    const row = this.db.prepare(sql).get(...params) as { cnt: number }
    this.logger.trace(
      'SqliteRepository.count returning',
      { count: row.cnt },
      194,
      'count',
    )
    return row.cnt
  }
}
