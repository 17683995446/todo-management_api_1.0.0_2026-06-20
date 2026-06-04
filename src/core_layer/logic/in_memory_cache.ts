import { BaseCache } from './base_cache.js'

interface CacheEntry<V> {
  value: V
  expiresAt?: number
}

export class InMemoryCache<K, V> extends BaseCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map()
  private cleanupInterval?: NodeJS.Timeout

  constructor(cleanupIntervalMs?: number) {
    super()
    if (cleanupIntervalMs) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs)
    }
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.cache.delete(key)
      }
    }
  }

  async get(key: K): Promise<V | null> {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return null
    }
    return entry.value
  }

  async set(key: K, value: V, ttl?: number): Promise<void> {
    const entry: CacheEntry<V> = { value }
    if (ttl) {
      entry.expiresAt = Date.now() + ttl
    }
    this.cache.set(key, entry)
  }

  async delete(key: K): Promise<boolean> {
    return this.cache.delete(key)
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }

  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }
}
