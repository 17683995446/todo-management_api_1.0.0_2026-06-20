import { createMiddleware } from 'hono/factory'
import type { Logger } from '../../../../core_layer/logic/logger.js'
import type { SlidingWindowRateLimiter } from '../../../../core_layer/logic/rate_limiter.js'

/**
 * 限流配置
 */
export interface RateLimitOptions {
  /** 限流器实例 */
  limiter: SlidingWindowRateLimiter
  /** 日志记录器 */
  logger: Logger
  /** 限流键生成函数，默认按 IP（X-Forwarded-For 优先） */
  keyGenerator?: (c: {
    req: { header: (name: string) => string | undefined }
  }) => string
  /** 跳过限流的路径前缀列表（例如健康检查） */
  skipPaths?: string[]
  /** 窗口大小（毫秒），用于计算 Retry-After */
  windowMs: number
}

/**
 * 限流中间件
 * 基于 SlidingWindowRateLimiter 实现按 IP 维度的请求限流。
 * 超出限制时返回 429 Too Many Requests，并附带 Retry-After 头。
 *
 * @param options - 限流配置
 */
export function createRateLimitMiddleware(options: RateLimitOptions) {
  const { limiter, logger, keyGenerator, skipPaths = [], windowMs } = options

  const defaultKeyGenerator = (c: {
    req: { header: (name: string) => string | undefined }
  }): string => {
    const forwarded = c.req.header('x-forwarded-for')
    if (forwarded) {
      // 取第一个 IP（最原始的客户端 IP）
      return forwarded.split(',')[0].trim()
    }
    return c.req.header('x-real-ip') || 'unknown'
  }

  const getKey = keyGenerator ?? defaultKeyGenerator

  return createMiddleware(async (c, next) => {
    const path = c.req.path

    // 跳过指定路径（如健康检查、静态首页）
    for (const skip of skipPaths) {
      if (path === skip || path.startsWith(skip)) {
        await next()
        return
      }
    }

    const key = getKey(c)
    const result = await limiter.check(key)

    // 在所有响应（含成功与限流拒绝）上附加 X-RateLimit 头，便于客户端自适应
    c.header('X-RateLimit-Limit', String(result.limit))
    c.header('X-RateLimit-Remaining', String(Math.max(0, result.remaining)))
    c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))

    if (!result.allowed) {
      logger.warn(
        'Rate limit exceeded',
        { key, path },
        47,
        'rateLimitMiddleware',
      )
      const retryAfterSec = Math.ceil(windowMs / 1000)
      c.header('Retry-After', String(retryAfterSec))
      return c.json(
        {
          success: false,
          error: 'Too Many Requests',
          message: `请求过于频繁，请在 ${retryAfterSec} 秒后重试`,
          retryAfter: retryAfterSec,
        },
        429,
      )
    }

    await next()
  })
}
