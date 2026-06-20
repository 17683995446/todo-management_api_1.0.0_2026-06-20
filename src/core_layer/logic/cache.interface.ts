/**
 * 基础缓存接口
 * @typeParam K - 键类型
 * @typeParam V - 值类型
 */
export interface ICache<K, V> {
  /**
   * 获取缓存值
   * @param key - 缓存键
   * @returns 缓存值，不存在返回 null
   */
  get(key: K): Promise<V | null>

  /**
   * 设置缓存值
   * @param key - 缓存键
   * @param value - 缓存值
   * @param ttl - 过期时间（毫秒），可选
   */
  set(key: K, value: V, ttl?: number): Promise<void>

  /**
   * 删除缓存值
   * @param key - 缓存键
   * @returns 删除是否成功
   */
  delete(key: K): Promise<boolean>

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>

  /**
   * 关闭缓存，清理资源（定时器等）
   */
  close(): void
}

/**
 * 带统计信息的缓存接口
 * @typeParam K - 键类型
 * @typeParam V - 值类型
 */
export interface ICacheWithStats<K, V> extends ICache<K, V> {
  /**
   * 获取缓存统计信息
   * @returns 统计信息对象
   */
  getStats(): Promise<{ hits: number; misses: number; size: number }>
}
