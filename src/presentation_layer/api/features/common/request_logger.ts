import { createMiddleware } from 'hono/factory'
import type { Logger } from '../../../../core_layer/logic/logger.js'

/**
 * 创建 Hono 请求日志中间件
 * @param logger - 日志记录器实例
 * @returns Hono 中间件
 */
export function createRequestLogger(logger: Logger) {
  return createMiddleware(async (c, next) => {
    const start = Date.now()
    const method = c.req.method
    const path = c.req.path
    logger.trace('Request started', { method, path }, 14, 'requestLogger')

    await next()

    const duration = Date.now() - start
    const status = c.res.status
    logger.trace('Request completed', { method, path, status, durationMs: duration }, 21, 'requestLogger')
  })
}
