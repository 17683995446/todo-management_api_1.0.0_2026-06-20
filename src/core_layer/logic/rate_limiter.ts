import type { Logger } from './logger.js'

export abstract class RateLimiter {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace('RateLimiter initialized', {}, 10, 'constructor')
  }

  abstract isAllowed(key: string): Promise<boolean>
}

/**
 * 限流检查结果
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  /** 窗口重置时间（Unix 毫秒时间戳） */
  resetAt: number
}

export class SlidingWindowRateLimiter extends RateLimiter {
  private windowMs: number
  private maxRequests: number
  private requests: Map<string, number[]> = new Map()

  constructor(logger: Logger, windowMs: number, maxRequests: number) {
    super(logger)
    this.windowMs = windowMs
    this.maxRequests = maxRequests
    this.logger.trace(
      'SlidingWindowRateLimiter initialized',
      { windowMs, maxRequests },
      23,
      'constructor',
    )
  }

  async isAllowed(key: string): Promise<boolean> {
    this.logger.trace(
      'SlidingWindowRateLimiter.isAllowed called',
      { key },
      26,
      'isAllowed',
    )
    const result = await this.check(key)
    return result.allowed
  }

  /**
   * 检查并记录请求，返回详细的限流信息（含剩余配额与重置时间）
   * @param key - 限流键（通常为 IP 或用户 ID）
   * @returns 限流检查结果
   */
  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - this.windowMs
    let timestamps = this.requests.get(key) || []
    timestamps = timestamps.filter((t) => t > windowStart)
    this.requests.set(key, timestamps)

    const resetAt =
      timestamps.length > 0
        ? timestamps[0] + this.windowMs
        : now + this.windowMs

    if (timestamps.length >= this.maxRequests) {
      this.logger.trace(
        'SlidingWindowRateLimiter.check: rate limited',
        { key, count: timestamps.length },
        33,
        'check',
      )
      return {
        allowed: false,
        remaining: 0,
        limit: this.maxRequests,
        resetAt,
      }
    }

    timestamps.push(now)
    this.logger.trace(
      'SlidingWindowRateLimiter.check: allowed',
      { key },
      37,
      'check',
    )
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      limit: this.maxRequests,
      resetAt,
    }
  }
}
