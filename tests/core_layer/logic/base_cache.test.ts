import { describe, it, expect, beforeEach } from 'vitest'
import { BaseCache } from '../../../src/core_layer/logic/base_cache.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

class TestCache extends BaseCache<string, string> {
  async get(key: string): Promise<string | null> { return null }
  async set(key: string, value: string, ttl?: number): Promise<void> {}
  async delete(key: string): Promise<boolean> { return true }
  async clear(): Promise<void> {}
}

describe('BaseCache', () => {
  let test_cache: TestCache
  let logger: ConsoleLogger
  let mock_config: AppConfig

  beforeEach(() => {
    mock_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mock_config, 'test_cache_logger')
    test_cache = new TestCache(logger)
  })

  it('should initialize successfully', () => {
    expect(test_cache).toBeInstanceOf(TestCache)
  })
})
