/**
 * 观察实体
 * 表示 Agent 在某一时刻对系统状态的感知快照。
 * 这是 OODA 循环的 "Observe" 阶段的输出。
 */
export interface Observation {
  id: string
  /** 观察时间戳 */
  timestamp: string
  /** 系统健康状态 */
  systemHealth: SystemHealth
  /** 运行指标 */
  metrics: SystemMetrics
  /** Todo 统计 */
  todoStats: TodoStats
  /** 检测到的异常列表 */
  anomalies: string[]
  /** 原始数据（用于调试和深度分析） */
  raw: Record<string, unknown>
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  /** 运行时长（秒） */
  uptimeSeconds: number
  /** 内存使用量（MB） */
  memoryUsageMb: number
  /** 是否有活跃的数据库连接 */
  dbConnected: boolean
}

export interface SystemMetrics {
  /** 总请求数 */
  requestCount: number
  /** 错误率（0-1） */
  errorRate: number
  /** 平均响应时间（毫秒） */
  avgResponseTimeMs: number
  /** 缓存命中率（0-1） */
  cacheHitRate: number
  /** 限流触发次数 */
  rateLimitHits: number
}

export interface TodoStats {
  total: number
  completed: number
  pending: number
  /** 已过期但未完成的数量 */
  overdue: number
  /** 按优先级分布 */
  byPriority: Record<string, number>
}
