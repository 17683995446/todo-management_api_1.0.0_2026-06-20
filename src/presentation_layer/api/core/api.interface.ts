import type { Hono } from 'hono'
import type { TraceContext } from '../../../core_layer/telemetry/telemetry_context.js'

/**
 * API 服务接口，定义 HTTP 服务器的启动、停止等契约
 */
export interface IApiServer {
  /**
   * 获取底层 Hono 应用实例
   * @returns Hono 应用
   */
  getApp(): Hono<{ Variables: ApiContext }>

  /**
   * 启动服务器并开始监听端口
   * @returns 解析为监听地址的 Promise
   */
  start(): Promise<{ host: string; port: number }>

  /**
   * 优雅地关闭服务器
   * @returns Promise<void>
   */
  stop(): Promise<void>
}

/**
 * API 配置上下文，用于在 Hono 上下文中共享依赖
 */
export interface ApiContext {
  /** 应用启动时间 */
  readonly startTime: Date
  /** 当前请求的追踪上下文 */
  readonly traceContext: TraceContext
  /** 已解析的请求体（由验证中间件设置） */
  parsedBody?: unknown
  /** 已认证的用户信息（由认证中间件设置） */
  user?: { userId: string; username: string }
}
