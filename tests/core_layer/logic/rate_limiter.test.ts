import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlidingWindowRateLimiter } from '../../../src/core_layer/logic/rate_limiter.js'

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter(10000, 3)
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
