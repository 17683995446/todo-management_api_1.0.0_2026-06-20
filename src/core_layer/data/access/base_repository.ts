import type { Logger } from '../../logic/logger.js'
import type { IRepository } from './repository.interface.js'

/**
 * 基础实体接口，所有实体必须实现的字段
 */
export interface BaseEntity {
  /** 实体唯一标识 */
  id: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 基础仓储抽象类，实现标准 CRUD 操作
 * @typeParam T - 实体类型，必须继承自 BaseEntity
 */
export abstract class BaseRepository<T extends BaseEntity> implements IRepository<T> {
  protected logger: Logger

  /**
   * 构造函数
   * @param logger - 日志记录器实例
   */
  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace('BaseRepository initialized', {}, 25, 'constructor')
  }

  /**
   * 获取所有实体
   * @returns 实体数组
   */
  abstract findAll(): Promise<T[]>

  /**
   * 根据 ID 查找实体
   * @param id - 实体唯一标识
   * @returns 实体对象，未找到返回 null
   */
  abstract findById(id: string): Promise<T | null>

  /**
   * 创建新实体
   * @param entity - 实体数据（不含 ID 和系统字段）
   * @returns 创建后的实体对象
   */
  abstract create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>

  /**
   * 更新实体
   * @param id - 实体唯一标识
   * @param entity - 要更新的数据
   * @returns 更新后的实体对象，未找到返回 null
   */
  abstract update(id: string, entity: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T | null>

  /**
   * 删除实体
   * @param id - 实体唯一标识
   * @returns 删除是否成功
   */
  abstract delete(id: string): Promise<boolean>
}
