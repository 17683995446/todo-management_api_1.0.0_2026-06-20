import { Hono } from 'hono'
import type { BaseEntity } from '../../../../core_layer/data/access/base_repository.js'
import type { SqliteRepository } from '../../../../core_layer/data/access/sqlite_repository.js'
import type { Logger } from '../../../../core_layer/logic/logger.js'
import type { ApiContext } from '../../core/api.interface.js'

/**
 * 健康检查响应结构
 */
export interface HealthResponse {
  success: true
  status: 'ok' | 'degraded' | 'unhealthy'
  timestamp: string
  uptimeSeconds: number
  version: string
  dbConnected: boolean
  memoryUsage: {
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
  }
}

/**
 * 健康检查依赖
 */
export interface HealthDeps {
  logger: Logger
  version: string
  todoRepo: SqliteRepository<BaseEntity>
}

/**
 * 创建健康检查路由
 *
 * 响应包含：
 * - status: ok（DB 正常）/ degraded（DB 不可用但服务在运行）
 * - version: 应用版本号
 * - dbConnected: 数据库连通性
 * - memoryUsage: Node.js 进程内存使用
 * - uptimeSeconds: 服务运行时长
 *
 * @param deps - 健康检查依赖
 * @returns Hono 子路由
 */
export function createHealthRoutes(deps: HealthDeps) {
  const { logger, version, todoRepo } = deps
  const router = new Hono<{ Variables: ApiContext }>()

  router.get('/health', async (c) => {
    logger.trace('Health check requested', {}, 40, 'healthRoutes')
    const startTime = c.get('startTime')

    // 检查 DB 连通性（执行简单查询）
    let dbConnected = true
    try {
      await todoRepo.findAll()
    } catch {
      dbConnected = false
    }

    const mem = process.memoryUsage()
    const response: HealthResponse = {
      success: true,
      status: dbConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime.getTime()) / 1000),
      version,
      dbConnected,
      memoryUsage: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
    }
    return c.json(response)
  })

  return router
}
