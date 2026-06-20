import type { BaseEntity } from './base_repository.js'

/**
 * 基础仓储接口，定义了标准的 CRUD 操作
 * @typeParam T - 实体类型，必须继承自 BaseEntity
 */
export interface IRepository<T extends BaseEntity> {
  /**
   * 获取所有实体
   * @returns 实体数组
   */
  findAll(): Promise<T[]>

  /**
   * 根据 ID 查找实体
   * @param id - 实体唯一标识
   * @returns 实体对象，未找到返回 null
   */
  findById(id: string): Promise<T | null>

  /**
   * 创建新实体
   * @param entity - 实体数据（不含 ID 和系统字段）
   * @returns 创建后的实体对象
   */
  create(entity: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T>

  /**
   * 更新实体
   * @param id - 实体唯一标识
   * @param entity - 要更新的数据
   * @returns 更新后的实体对象，未找到返回 null
   */
  update(id: string, entity: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T | null>

  /**
   * 删除实体
   * @param id - 实体唯一标识
   * @returns 删除是否成功
   */
  delete(id: string): Promise<boolean>
}

/**
 * 可分页查询的仓储接口
 * @typeParam T - 实体类型
 */
export interface IPaginatedRepository<T extends BaseEntity> extends IRepository<T> {
  /**
   * 分页获取实体
   * @param page - 页码（从 1 开始）
   * @param pageSize - 每页数量
   * @returns 分页结果
   */
  findPaginated(page: number, pageSize: number): Promise<{ items: T[]; total: number }>
}
