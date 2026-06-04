export abstract class RateLimiter {
  abstract isAllowed(key: string): Promise<boolean>
}

export class SlidingWindowRateLimiter extends RateLimiter {
  private windowMs: number
  private maxRequests: number
  private requests: Map<string, number[]> = new Map()

  constructor(windowMs: number, maxRequests: number) {
    super()
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  async isAllowed(key: string): Promise<boolean> {
    const now = Date.now()
    const windowStart = now - this.windowMs
    let timestamps = this.requests.get(key) || []
    timestamps = timestamps.filter(t => t > windowStart)
    this.requests.set(key, timestamps)
    if (timestamps.length >= this.maxRequests) {
      return false
    }
    timestamps.push(now)
    return true
  }
}
