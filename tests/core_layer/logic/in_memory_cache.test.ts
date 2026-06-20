import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { InMemoryCache } from '../../../src/core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('InMemoryCache', () => {
  let cache: InMemoryCache<string, string>
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'cache-test-logger')
    cache = new InMemoryCache<string, string>(logger)
  })

  afterEach(() => {
    cache.close()
    vi.clearAllMocks()
  })

  it('should initialize without cleanup interval', () => {
    expect(cache).toBeInstanceOf(InMemoryCache)
  })

  it('should initialize with cleanup interval', () => {
    const cacheWithCleanup = new InMemoryCache<string, string>(logger, 1000)
    expect(cacheWithCleanup).toBeInstanceOf(InMemoryCache)
    cacheWithCleanup.close()
  })

  it('should set and get a value', async () => {
    await cache.set('key', 'value')
    expect(await cache.get('key')).toEqual('value')
  })

  it('should return null for non-existent key', async () => {
    expect(await cache.get('nonexistent')).toBeNull()
  })

  it('should delete a value', async () => {
    await cache.set('key', 'value')
    const deleted = await cache.delete('key')
    expect(deleted).toBe(true)
    expect(await cache.get('key')).toBeNull()
  })

  it('should return false when deleting non-existent key', async () => {
    const deleted = await cache.delete('nonexistent')
    expect(deleted).toBe(false)
  })

  it('should clear all values', async () => {
    await cache.set('key1', 'value1')
    await cache.set('key2', 'value2')
    await cache.clear()
    expect(await cache.get('key1')).toBeNull()
    expect(await cache.get('key2')).toBeNull()
  })

  it('should expire values after TTL', async () => {
    vi.useFakeTimers()
    await cache.set('key', 'value', 1000)
    expect(await cache.get('key')).toEqual('value')
    vi.advanceTimersByTime(1500)
    expect(await cache.get('key')).toBeNull()
    vi.useRealTimers()
  })

  it('should close without errors', () => {
    expect(() => cache.close()).not.toThrow()
  })

  // ===== Phase 6: Cache Stats & Bulk Invalidation =====

  it('should track hits and misses', async () => {
    await cache.set('key', 'value')
    await cache.get('key') // hit
    await cache.get('missing') // miss
    const stats = await cache.getStats()
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.size).toBe(1)
  })

  it('should count expired entries as misses', async () => {
    vi.useFakeTimers()
    await cache.set('key', 'value', 1000)
    vi.advanceTimersByTime(1500)
    await cache.get('key') // miss (expired)
    vi.useRealTimers()
    const stats = await cache.getStats()
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(0)
  })

  it('should delete by prefix', async () => {
    await cache.set('todos:user1:list', 'a')
    await cache.set('todos:user1:item:1', 'b')
    await cache.set('todos:user2:list', 'c')
    await cache.set('other:key', 'd')

    const deleted = await cache.deleteByPrefix('todos:user1:')
    expect(deleted).toBe(2)
    expect(await cache.get('todos:user1:list')).toBeNull()
    expect(await cache.get('todos:user1:item:1')).toBeNull()
    expect(await cache.get('todos:user2:list')).toEqual('c')
    expect(await cache.get('other:key')).toEqual('d')
  })

  it('should return 0 when deleting by prefix with no matches', async () => {
    await cache.set('key', 'value')
    const deleted = await cache.deleteByPrefix('nonexistent:')
    expect(deleted).toBe(0)
  })

  it('should reset stats after clear', async () => {
    await cache.set('key', 'value')
    await cache.get('key') // hit
    await cache.get('missing') // miss
    await cache.clear()
    const stats = await cache.getStats()
    expect(stats.size).toBe(0)
    // hits/misses counters are NOT reset by clear (cumulative)
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
  })
})
