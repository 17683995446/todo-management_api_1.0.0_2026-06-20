import { type ServerType, serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { IRepository } from '../../../core_layer/data/access/repository.interface.js'
import type { SqliteRepository } from '../../../core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../../core_layer/data/model/app_config.js'
import type { AuthService } from '../../../core_layer/logic/auth_service.js'
import type { InMemoryCache } from '../../../core_layer/logic/in_memory_cache.js'
import type { Logger } from '../../../core_layer/logic/logger.js'
import type { SlidingWindowRateLimiter } from '../../../core_layer/logic/rate_limiter.js'
import type { Todo } from '../../../core_layer/model/todo.js'
import type { User } from '../../../core_layer/model/user.js'
import type { TelemetryManager } from '../../../core_layer/telemetry/telemetry_context.js'
import { createTelemetryMiddleware } from '../../../core_layer/telemetry/telemetry_middleware.js'
import { createErrorHandler } from '../features/common/error_handler.js'
import { createRateLimitMiddleware } from '../features/common/rate_limit_middleware.js'
import { createRequestLogger } from '../features/common/request_logger.js'
import { createSecurityHeadersMiddleware } from '../features/common/security_headers.js'
import { createApiDiscoveryRoutes } from '../features/routes/api_routes.js'
import { createAuthRoutes } from '../features/routes/auth_routes.js'
import { createHealthRoutes } from '../features/routes/health_routes.js'
import { createHomeRoutes } from '../features/routes/home_routes.js'
import { createStatsRoutes } from '../features/routes/stats_routes.js'
import { createTodoRoutes } from '../features/routes/todo_routes.js'
import type { ApiContext, IApiServer } from './api.interface.js'

/**
 * 基于 Hono 的 API 服务实现
 */
export class HonoApiServer implements IApiServer {
  private readonly app: Hono<{ Variables: ApiContext }>
  private readonly logger: Logger
  private readonly config: AppConfig
  private readonly todoRepo: IRepository<Todo>
  private readonly userRepo: IRepository<User>
  private readonly authService: AuthService
  private readonly telemetry: TelemetryManager
  private readonly cache: InMemoryCache<string, unknown> | null
  private readonly rateLimiter: SlidingWindowRateLimiter | null
  private server: ServerType | null = null
  private readonly startTime: Date

  /**
   * 构造函数
   * @param config - 应用配置
   * @param logger - 日志记录器实例
   * @param todoRepo - Todo 仓储实例
   * @param userRepo - 用户仓储实例
   * @param authService - 认证服务实例
   * @param telemetry - Telemetry 管理器
   * @param cache - 可选的缓存实例
   * @param rateLimiter - 可选的限流器实例
   */
  constructor(
    config: AppConfig,
    logger: Logger,
    todoRepo: IRepository<Todo>,
    userRepo: IRepository<User>,
    authService: AuthService,
    telemetry: TelemetryManager,
    cache?: InMemoryCache<string, unknown>,
    rateLimiter?: SlidingWindowRateLimiter,
  ) {
    this.config = config
    this.logger = logger
    this.todoRepo = todoRepo
    this.userRepo = userRepo
    this.authService = authService
    this.telemetry = telemetry
    this.cache = cache ?? null
    this.rateLimiter = rateLimiter ?? null
    this.startTime = new Date()
    this.app = this.buildApp()
    this.logger.trace('HonoApiServer initialized', {}, 60, 'constructor')
  }

  /**
   * 构建 Hono 应用并注册中间件与路由
   * @returns 配置完成的 Hono 应用
   */
  private buildApp(): Hono<{ Variables: ApiContext }> {
    const app = new Hono<{ Variables: ApiContext }>()

    app.use(
      cors({
        origin: '*',
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      }),
    )

    // 安全响应头（最先执行，确保覆盖所有响应）
    app.use(createSecurityHeadersMiddleware({ enableHsts: false }))

    app.use(createTelemetryMiddleware(this.telemetry))
    app.use(createRequestLogger(this.logger))

    // 全局限流（跳过健康检查，避免监控探针消耗配额）
    if (this.rateLimiter) {
      app.use(
        createRateLimitMiddleware({
          limiter: this.rateLimiter,
          logger: this.logger,
          windowMs: 60_000,
          skipPaths: ['/health'],
        }),
      )
    }

    app.use(async (c, next) => {
      c.set('startTime', this.startTime)
      await next()
    })

    app.route('/', createHomeRoutes(this.logger))
    app.route(
      '/',
      createHealthRoutes({
        logger: this.logger,
        version: this.config.app.version,
        todoRepo: this.todoRepo as SqliteRepository<Todo>,
      }),
    )
    app.route(
      '/',
      createApiDiscoveryRoutes(this.logger, this.config.app.version),
    )
    app.route(
      '/',
      createAuthRoutes(this.logger, this.userRepo, this.authService),
    )
    app.route(
      '/',
      createTodoRoutes(
        this.logger,
        this.todoRepo as SqliteRepository<Todo>,
        this.authService,
        this.cache,
      ),
    )
    app.route('/', createStatsRoutes(this.logger, this.cache))

    app.notFound((c) => {
      this.logger.trace('Route not found', { path: c.req.path }, 80, 'notFound')
      return c.json({ success: false, error: 'Route not found' }, 404)
    })

    app.onError(createErrorHandler(this.logger))

    return app
  }

  /**
   * 获取 Hono 应用实例
   * @returns Hono 应用
   */
  getApp(): Hono<{ Variables: ApiContext }> {
    return this.app
  }

  /**
   * 启动服务器
   * @returns 解析为监听地址的 Promise
   */
  start(): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      const host = this.config.server.host || '0.0.0.0'
      const port =
        typeof this.config.server.port === 'number'
          ? this.config.server.port
          : 80

      this.logger.trace('Starting Hono server', { host, port }, 76, 'start')

      this.server = serve(
        {
          fetch: this.app.fetch,
          hostname: host,
          port,
        },
        (info) => {
          const address = info as { address: string; port: number }
          this.logger.info(
            `Server listening on http://${address.address}:${address.port}`,
            { host: address.address, port: address.port },
            84,
            'start',
          )
          resolve({ host: address.address, port: address.port })
        },
      )

      this.server.on('error', (err: Error) => {
        this.logger.error(
          'Server failed to start',
          { error: err.message },
          89,
          'start',
        )
        reject(err)
      })
    })
  }

  /**
   * 优雅地关闭服务器
   * @returns Promise<void>
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.trace('Stopping Hono server', {}, 98, 'stop')
      if (!this.server) {
        this.logger.trace('Server was not running', {}, 100, 'stop')
        resolve()
        return
      }
      this.server.close((err) => {
        if (err) {
          this.logger.error(
            'Error stopping server',
            { error: err.message },
            106,
            'stop',
          )
          reject(err)
          return
        }
        this.logger.trace('Hono server stopped', {}, 109, 'stop')
        this.server = null
        this.telemetry.shutdown().catch(() => {})
        resolve()
      })
    })
  }
}
