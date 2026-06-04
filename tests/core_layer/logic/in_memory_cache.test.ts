import { describe, it, expect, beforeEach, vi } from 'vitest'
import { InMemoryCache } from '../../../src/core_layer/logic/in_memory_cache.js'

describe('InMemoryCache', () => {
  let cache: InMemoryCache<string, string>

  beforeEach(() => {
    cache = new InMemoryCache<string, string>()
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
})
