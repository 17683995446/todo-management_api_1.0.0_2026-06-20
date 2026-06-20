import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlidingWindowRateLimiter } from '../../../src/core_layer/logic/rate_limiter.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter

  beforeEach(() => {
    const config: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    const logger = new ConsoleLogger(config, 'rate-limiter-test-logger')
    limiter = new SlidingWindowRateLimiter(logger, 10000, 3)
  })

  it('should allow requests under limit', async () => {
    expect(await limiter.isAllowed('user1')).toBe(true)
    expect(await limiter.isAllowed('user1')).toBe(true)
    expect(await limiter.isAllowed('user1')).toBe(true)
  })

  it('should block requests over limit', async () => {
    await limiter.isAllowed('user1')
    await limiter.isAllowed('user1')
    await limiter.isAllowed('user1')
    expect(await limiter.isAllowed('user1')).toBe(false)
  })

  it('should allow requests after window resets', async () => {
    vi.useFakeTimers()
    await limiter.isAllowed('user1')
    await limiter.isAllowed('user1')
    await limiter.isAllowed('user1')
    vi.advanceTimersByTime(15000)
    expect(await limiter.isAllowed('user1')).toBe(true)
    vi.useRealTimers()
  })
})
