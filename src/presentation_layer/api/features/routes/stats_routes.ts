import { Hono } from 'hono'
import type { Logger } from '../../../../core_layer/logic/logger.js'
import type { InMemoryCache } from '../../../../core_layer/logic/in_memory_cache.js'

/**
 * 创建统计信息路由（缓存监控）
 * @param logger - 日志记录器实例
 * @param cache - 缓存实例（可选）
 * @returns Hono 子路由
 */
export function createStatsRoutes(logger: Logger, cache: InMemoryCache<string, unknown> | null) {
  const router = new Hono()

  router.get('/api/stats/cache', async c => {
    logger.trace('GET /api/stats/cache called', {}, 13, 'statsRoutes')
    if (!cache) {
      return c.json({ success: true, data: { enabled: false, message: 'Cache is not configured' } })
    }
    const stats = await cache.getStats()
    const hitRate = stats.hits + stats.misses > 0 ? (stats.hits / (stats.hits + stats.misses)) * 100 : 0
    return c.json({
      success: true,
      data: {
        enabled: true,
        hits: stats.hits,
        misses: stats.misses,
        size: stats.size,
        hitRate: Math.round(hitRate * 100) / 100
      }
    })
  })

  router.delete('/api/stats/cache', async c => {
    logger.trace('DELETE /api/stats/cache called', {}, 27, 'statsRoutes')
    if (!cache) {
      return c.json({ success: true, data: { cleared: 0, message: 'Cache is not configured' } })
    }
    await cache.clear()
    return c.json({ success: true, data: { cleared: true } })
  })

  return router
}
