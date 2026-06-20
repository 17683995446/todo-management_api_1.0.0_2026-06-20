/**
 * 🚀 HTTP Server for production deployment!
 *
 * This server provides REST API endpoints for our todo application.
 */

import { SqliteRepository } from './core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from './core_layer/data/model/app_config.js'
import { parse_config } from './core_layer/data/parse/config_parser.js'
import { get_env } from './core_layer/data/parse/env_loader.js'
import { AuthService } from './core_layer/logic/auth_service.js'
import {
  DEMO_PASSWORD,
  DEMO_USERNAME,
  seedDemoData,
} from './core_layer/logic/demo_seeder.js'
import { InMemoryCache } from './core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from './core_layer/logic/logger.js'
import { SlidingWindowRateLimiter } from './core_layer/logic/rate_limiter.js'
import { ShutdownManager } from './core_layer/logic/shutdown_manager.js'
import { type Todo, todoSqliteConfig } from './core_layer/model/todo.js'
import { type User, userSqliteConfig } from './core_layer/model/user.js'
import { TelemetryManager } from './core_layer/telemetry/telemetry_context.js'
import { HonoApiServer } from './presentation_layer/api/core/hono_api.js'

async function startServer() {
  console.log('🚀 Starting server...')

  // Initialize system
  const tempConfig: AppConfig = {
    app: { name: 'todo-api', version: '1.0.0', debug: true },
    server: { host: '0.0.0.0', port: 80 },
    database: { host: 'localhost', port: 5432, name: 'todo', user: 'todo' },
    logging: { level: 'info', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 },
  }
  const tempLogger = new ConsoleLogger(tempConfig, 'temp')
  const env = get_env(tempLogger)
  const config = await parse_config(env, tempLogger)
  const logger = new ConsoleLogger(config, 'server')
  const shutdownManager = new ShutdownManager(logger, false)

  // Initialize persistent storage (SQLite)
  const dbPath = process.env.DB_PATH || 'data/todos.db'
  const todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
  const userRepo = new SqliteRepository<User>(logger, dbPath, userSqliteConfig)
  const authService = new AuthService(logger)
  const cache = new InMemoryCache<string, unknown>(logger, 30000)
  // 限流：每分钟 100 次请求/IP（可由配置覆盖）
  const rateLimitPerMin =
    config.api?.rate_limit && config.api.rate_limit > 0
      ? config.api.rate_limit
      : 100
  const rateLimiter = new SlidingWindowRateLimiter(
    logger,
    60_000,
    rateLimitPerMin,
  )

  // Add sample data only if database is empty
  const seeded = await seedDemoData(logger, userRepo, todoRepo, authService)
  if (seeded) {
    console.log(`\n👤 演示账号已创建: ${DEMO_USERNAME} / ${DEMO_PASSWORD}`)
  }

  // Create telemetry manager
  const telemetry = new TelemetryManager(config.app.name, config.app.version)

  // Create Hono API server
  const apiServer = new HonoApiServer(
    config,
    logger,
    todoRepo,
    userRepo,
    authService,
    telemetry,
    cache,
    rateLimiter,
  )

  // Shutdown hook
  shutdownManager.addHook(async () => {
    logger.info('Shutting down server', {})
    await apiServer.stop()
    await cache.close()
    await telemetry.shutdown()
    todoRepo.close()
    userRepo.close()
  })

  // Start listening
  const address = await apiServer.start()
  const baseUrl = `http://${address.host}:${address.port}`
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  ✅ 服务器已启动！')
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log(`  🌐 基础地址:  ${baseUrl}`)
  console.log(`  📋 Web 界面:  ${baseUrl}/`)
  console.log(`  💚 健康检查:  ${baseUrl}/health`)
  console.log(`  📖 API 发现:  ${baseUrl}/api`)
  console.log(`  📝 Todo API:  ${baseUrl}/api/todos`)
  console.log(`  🔐 注册:      ${baseUrl}/api/auth/register`)
  console.log(`  🔑 登录:      ${baseUrl}/api/auth/login`)
  console.log(`  📊 缓存统计:  ${baseUrl}/api/stats/cache`)
  console.log(`  💾 数据库:    ${dbPath}`)
  console.log(`  🌍 环境:      ${env}`)
  console.log(`  📦 版本:      ${config.app.version}`)
  console.log(`\n  👤 演示账号:  ${DEMO_USERNAME} / ${DEMO_PASSWORD}`)
  console.log('\n═══════════════════════════════════════════════════════════\n')
}

/**
 * 将启动错误转换为可操作的提示信息
 */
function formatStartupError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string })?.code

  // 端口被占用
  if (code === 'EADDRINUSE' || msg.includes('EADDRINUSE')) {
    return `端口被占用。请修改 config/${process.env.NODE_ENV || 'development'}.yaml 中的 server.port，或停止占用该端口的进程。`
  }
  // 配置文件缺失
  if (code === 'ENOENT' && msg.includes('.yaml')) {
    return `配置文件不存在: ${msg}\n请检查 NODE_ENV 环境变量（当前: ${process.env.NODE_ENV || 'development'}），确保 config/ 目录下有对应的 YAML 文件。`
  }
  // 权限不足
  if (code === 'EACCES') {
    return `权限不足: ${msg}\n请检查文件/目录权限，或避免使用 1024 以下端口。`
  }
  return msg
}

startServer().catch((err) => {
  console.error('\n❌ 服务器启动失败:\n')
  console.error(`  ${formatStartupError(err)}\n`)
  if (process.env.DEBUG) {
    console.error('堆栈:')
    console.error(err instanceof Error ? err.stack : err)
  }
  process.exit(1)
})
