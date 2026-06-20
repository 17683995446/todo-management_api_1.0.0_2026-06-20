import { createMiddleware } from 'hono/factory'
import type { TelemetryManager, TraceContext } from './telemetry_context.js'
import { generateTraceContext, runWithTraceContext } from './telemetry_context.js'

/**
 * 创建 Hono 追踪中间件
 * 为每个请求生成唯一的 trace/span 上下文，并绑定到异步上下文
 * @param telemetry - Telemetry 管理器
 * @returns Hono 中间件
 */
export function createTelemetryMiddleware(telemetry: TelemetryManager) {
  return createMiddleware(async (c, next) => {
    const traceContext: TraceContext = generateTraceContext()
    c.set('traceContext', traceContext)

    const span = telemetry.startSpan(`HTTP ${c.req.method} ${c.req.path}`)
    span.setAttribute('http.method', c.req.method)
    span.setAttribute('http.path', c.req.path)

    try {
      await runWithTraceContext(traceContext, async () => {
        await next()
      })
      span.setAttribute('http.status_code', c.res.status)
    } catch (err) {
      span.setAttribute('http.status_code', 500)
      span.recordException(err as Error)
      throw err
    } finally {
      span.end()
    }
  })
}
