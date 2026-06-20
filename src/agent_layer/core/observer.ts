import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { IRepository } from '../../core_layer/data/access/repository.interface.js'
import type { ICacheWithStats } from '../../core_layer/logic/cache.interface.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import type { SlidingWindowRateLimiter } from '../../core_layer/logic/rate_limiter.js'
import type { Todo } from '../../core_layer/model/todo.js'
import type { IObserver } from '../agent.interface.js'
import type {
  Observation,
  SystemHealth,
  SystemMetrics,
  TodoStats,
} from '../model/observation.js'

/**
 * 系统观察者
 *
 * 收集系统当前状态，形成观察快照。
 * 这是 OODA 循环的 "Observe" 阶段。
 *
 * 观察维度：
 * 1. 系统健康：运行时间、内存、DB 连接
 * 2. 运行指标：请求数、错误率、响应时间、缓存命中率
 * 3. 业务统计：Todo 总数、完成率、过期数、优先级分布
 * 4. 异常检测：基于阈值自动检测异常
 */
export class SystemObserver implements IObserver {
  /** 系统启动时间戳 */
  private readonly startTime: number
  /** 累计请求数（由外部中间件递增） */
  private requestCount = 0
  /** 累计错误数 */
  private errorCount = 0
  /** 累计响应时间（毫秒） */
  private totalResponseTimeMs = 0
  /** 限流触发次数 */
  private rateLimitHits = 0

  constructor(
    private readonly logger: Logger,
    private readonly todoRepo: IRepository<Todo>,
    private readonly cache?: ICacheWithStats<string, unknown> | null,
    private readonly rateLimiter?: SlidingWindowRateLimiter | null,
  ) {
    this.startTime = performance.now()
  }

  /**
   * 记录一次请求（供中间件调用）
   */
  recordRequest(responseTimeMs: number, isError = false): void {
    this.requestCount++
    this.totalResponseTimeMs += responseTimeMs
    if (isError) this.errorCount++
  }

  /**
   * 记录一次限流触发
   */
  recordRateLimitHit(): void {
    this.rateLimitHits++
  }

  async observe(): Promise<Observation> {
    const timestamp = new Date().toISOString()
    this.logger.debug('Observing system state...', {})

    const systemHealth = await this.collectSystemHealth()
    const cacheStats = await this.collectCacheStats()
    const metrics = this.collectMetrics(cacheStats.hitRate)
    const todoStats = await this.collectTodoStats()
    const anomalies = this.detectAnomalies(systemHealth, metrics, todoStats)

    const observation: Observation = {
      id: randomUUID(),
      timestamp,
      systemHealth,
      metrics,
      todoStats,
      anomalies,
      raw: {
        processUptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
      },
    }

    this.logger.info('Observation completed', {
      health: systemHealth.status,
      anomalies: anomalies.length,
      todoTotal: todoStats.total,
      cacheHitRate: metrics.cacheHitRate,
    })

    return observation
  }

  /**
   * 收集缓存统计
   */
  private async collectCacheStats(): Promise<{ hitRate: number }> {
    if (!this.cache) return { hitRate: 0 }
    try {
      const stats = await this.cache.getStats()
      const total = stats.hits + stats.misses
      return { hitRate: total > 0 ? stats.hits / total : 0 }
    } catch {
      return { hitRate: 0 }
    }
  }

  /**
   * 收集系统健康状态
   */
  private async collectSystemHealth(): Promise<SystemHealth> {
    const memUsage = process.memoryUsage()
    const memoryUsageMb = Math.round((memUsage.rss / 1024 / 1024) * 100) / 100
    const uptimeSeconds = Math.round(
      (performance.now() - this.startTime) / 1000,
    )

    // 检查 DB 连接：尝试查询 todo 数量
    let dbConnected = true
    try {
      await this.todoRepo.findAll()
    } catch {
      dbConnected = false
    }

    // 健康状态判定
    let status: SystemHealth['status'] = 'healthy'
    if (!dbConnected) {
      status = 'unhealthy'
    } else if (memoryUsageMb > 500) {
      // 内存超过 500MB 视为降级
      status = 'degraded'
    }

    return {
      status,
      uptimeSeconds,
      memoryUsageMb,
      dbConnected,
    }
  }

  /**
   * 收集运行指标
   */
  private collectMetrics(cacheHitRate: number): SystemMetrics {
    const errorRate =
      this.requestCount > 0 ? this.errorCount / this.requestCount : 0
    const avgResponseTimeMs =
      this.requestCount > 0 ? this.totalResponseTimeMs / this.requestCount : 0

    return {
      requestCount: this.requestCount,
      errorRate,
      avgResponseTimeMs: Math.round(avgResponseTimeMs * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      rateLimitHits: this.rateLimitHits,
    }
  }

  /**
   * 收集 Todo 业务统计
   */
  private async collectTodoStats(): Promise<TodoStats> {
    try {
      const todos = await this.todoRepo.findAll()
      const now = new Date()
      const byPriority: Record<string, number> = {}

      let completed = 0
      let overdue = 0

      for (const todo of todos) {
        if (todo.completed) {
          completed++
        } else {
          if (todo.dueDate && todo.dueDate < now) {
            overdue++
          }
        }
        const p = todo.priority || 'medium'
        byPriority[p] = (byPriority[p] || 0) + 1
      }

      return {
        total: todos.length,
        completed,
        pending: todos.length - completed,
        overdue,
        byPriority,
      }
    } catch (err) {
      this.logger.error('Failed to collect todo stats', { error: String(err) })
      return {
        total: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        byPriority: {},
      }
    }
  }

  /**
   * 异常检测
   * 基于预设阈值检测系统异常
   */
  private detectAnomalies(
    health: SystemHealth,
    metrics: SystemMetrics,
    todoStats: TodoStats,
  ): string[] {
    const anomalies: string[] = []

    // 系统健康异常
    if (health.status === 'unhealthy') {
      anomalies.push('System is unhealthy: database connection lost')
    }
    if (health.status === 'degraded') {
      anomalies.push(
        `System degraded: high memory usage (${health.memoryUsageMb}MB)`,
      )
    }

    // 错误率异常
    if (metrics.requestCount > 10 && metrics.errorRate > 0.1) {
      anomalies.push(
        `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
      )
    }

    // 响应时间异常
    if (metrics.avgResponseTimeMs > 1000) {
      anomalies.push(
        `Slow response time: ${metrics.avgResponseTimeMs}ms average`,
      )
    }

    // 缓存命中率异常
    if (metrics.cacheHitRate < 0.3 && metrics.requestCount > 20) {
      anomalies.push(
        `Low cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`,
      )
    }

    // 限流异常
    if (metrics.rateLimitHits > 50) {
      anomalies.push(
        `Rate limit frequently triggered: ${metrics.rateLimitHits} hits`,
      )
    }

    // 业务异常：过多过期未完成
    if (todoStats.overdue > 10) {
      anomalies.push(`${todoStats.overdue} overdue todos need attention`)
    }

    // 业务异常：积压过多
    if (todoStats.pending > 100) {
      anomalies.push(`${todoStats.pending} pending todos may indicate backlog`)
    }

    return anomalies
  }
}
