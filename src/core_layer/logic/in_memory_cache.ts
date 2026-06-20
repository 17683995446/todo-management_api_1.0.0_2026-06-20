import { BaseCache } from './base_cache.js'
import type { Logger } from "./logger.js"
import type { ICacheWithStats } from './cache.interface.js'

interface CacheEntry<V> {
  value: V
  expiresAt?: number
}

export class InMemoryCache<K, V> extends BaseCache<K, V> implements ICacheWithStats<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map()
  private cleanupInterval?: NodeJS.Timeout
  private hits = 0
  private misses = 0

  constructor(logger: Logger, cleanupIntervalMs?: number) {
    super(logger)
    if (cleanupIntervalMs) {
      this.logger.trace("InMemoryCache: setting up cleanup interval", { intervalMs: cleanupIntervalMs }, 21, "constructor")
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs)
    }
  }

  private cleanup(): void {
    this.logger.trace("InMemoryCache.cleanup called", {}, 26, "cleanup")
    const now = Date.now()
    let deleted = 0
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.cache.delete(key)
        deleted++
      }
    }
    this.logger.trace("InMemoryCache.cleanup completed", { deleted }, 34, "cleanup")
  }

  async get(key: K): Promise<V | null> {
    this.logger.trace("InMemoryCache.get called", { key }, 37, "get")
    const entry = this.cache.get(key)
    if (!entry) {
      this.misses++
      this.logger.trace("InMemoryCache.get: key not found", { key }, 40, "get")
      return null
    }
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.misses++
      this.logger.trace("InMemoryCache.get: key expired", { key }, 43, "get")
      this.cache.delete(key)
      return null
    }
    this.hits++
    this.logger.trace("InMemoryCache.get: returning value", { key }, 47, "get")
    return entry.value
  }

  async set(key: K, value: V, ttl?: number): Promise<void> {
    this.logger.trace("InMemoryCache.set called", { key, ttl }, 50, "set")
    const entry: CacheEntry<V> = { value }
    if (ttl) {
      entry.expiresAt = Date.now() + ttl
    }
    this.cache.set(key, entry)
    this.logger.trace("InMemoryCache.set: stored value", { key }, 57, "set")
  }

  async delete(key: K): Promise<boolean> {
    this.logger.trace("InMemoryCache.delete called", { key }, 60, "delete")
    const result = this.cache.delete(key)
    this.logger.trace("InMemoryCache.delete: result", { key, deleted: result }, 62, "delete")
    return result
  }

  async clear(): Promise<void> {
    this.logger.trace("InMemoryCache.clear called", {}, 65, "clear")
    this.cache.clear()
  }

  /**
   * 按前缀批量删除缓存项
   * @param prefix - 键的前缀（支持 toString）
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    this.logger.trace("InMemoryCache.deleteByPrefix called", { prefix }, 72, "deleteByPrefix")
    let deleted = 0
    for (const key of this.cache.keys()) {
      if (String(key).startsWith(prefix)) {
        this.cache.delete(key)
        deleted++
      }
    }
    this.logger.trace("InMemoryCache.deleteByPrefix returning", { prefix, deleted }, 80, "deleteByPrefix")
    return deleted
  }

  async getStats(): Promise<{ hits: number; misses: number; size: number }> {
    this.logger.trace("InMemoryCache.getStats called", {}, 84, "getStats")
    return { hits: this.hits, misses: this.misses, size: this.cache.size }
  }

  close(): void {
    this.logger.trace("InMemoryCache.close called", {}, 89, "close")
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
  }
}
