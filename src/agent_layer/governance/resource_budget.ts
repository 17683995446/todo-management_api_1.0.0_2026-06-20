import process from 'node:process'
import type { Logger } from '../../core_layer/logic/logger.js'
import type { IResourceBudget } from '../agent.interface.js'
import type {
  BudgetCheckResult,
  BudgetConfig,
  BudgetDimension,
  BudgetLimit,
  BudgetPeriod,
  BudgetUsage,
} from '../model/budget.js'
import { DEFAULT_BUDGET_CONFIG } from '../model/budget.js'

/**
 * 资源预算管理器
 *
 * 跟踪资源使用，在超限时拒绝执行，防止失控。
 *
 * 设计原则：
 * - 预算按周期跟踪（per_cycle 在每次循环开始时重置）
 * - 每个维度独立跟踪使用量
 * - 软限制触发告警，硬限制触发拒绝
 * - 内存使用从 process.memoryUsage() 实时获取
 * - check() 返回详细的使用情况和违规列表
 *
 * 这是秩序化的资源约束：自主性不等于无限制。
 */
export class ResourceBudget implements IResourceBudget {
  /** 当前预算配置 */
  private config: BudgetConfig
  /** 使用量跟踪表（key: `${dimension}:${period}` → used） */
  private readonly usage = new Map<string, number>()
  /** 周期开始时间（用于判断是否需要重置） */
  private readonly periodStart = new Map<string, number>()

  constructor(
    private readonly logger: Logger,
    config?: BudgetConfig,
  ) {
    this.config = config ?? DEFAULT_BUDGET_CONFIG
    // 初始化所有周期开始时间
    const now = Date.now()
    for (const limit of this.config.limits) {
      const key = this.usageKey(limit.dimension, limit.period)
      this.periodStart.set(key, now)
    }
  }

  configure(config: BudgetConfig): void {
    this.config = config
    this.usage.clear()
    this.periodStart.clear()
    const now = Date.now()
    for (const limit of this.config.limits) {
      const key = this.usageKey(limit.dimension, limit.period)
      this.periodStart.set(key, now)
    }
    this.logger.info('Budget configured', { limitCount: config.limits.length })
  }

  recordUsage(dimension: BudgetDimension, amount: number): void {
    // 找到该维度的所有周期限制
    const limits = this.config.limits.filter((l) => l.dimension === dimension)
    for (const limit of limits) {
      const key = this.usageKey(limit.dimension, limit.period)
      // 检查是否需要重置周期
      if (this.shouldResetPeriod(limit.period, key)) {
        this.usage.set(key, 0)
        this.periodStart.set(key, Date.now())
      }
      const current = this.usage.get(key) ?? 0
      this.usage.set(key, current + amount)
    }
  }

  check(): BudgetCheckResult {
    const violatedLimits: BudgetUsage[] = []
    const warnings: BudgetUsage[] = []

    for (const limit of this.config.limits) {
      const usage = this.getUsageForLimit(limit)

      if (usage.overHardLimit) {
        violatedLimits.push(usage)
      } else if (usage.overSoftLimit) {
        warnings.push(usage)
      }
    }

    const allowed = violatedLimits.length === 0

    if (!allowed) {
      this.logger.warn('Budget hard limit exceeded', {
        violated: violatedLimits.map(
          (v) => `${v.dimension}:${v.period}=${v.used}/${v.hardLimit}`,
        ),
      })
    } else if (warnings.length > 0) {
      this.logger.info('Budget soft limit approaching', {
        warnings: warnings.map(
          (w) => `${w.dimension}:${w.period}=${w.used}/${w.softLimit}`,
        ),
      })
    }

    return {
      allowed,
      violatedLimits,
      warnings,
    }
  }

  getUsage(): BudgetUsage[] {
    return this.config.limits.map((limit) => this.getUsageForLimit(limit))
  }

  resetPeriod(period: BudgetPeriod): void {
    for (const limit of this.config.limits) {
      if (limit.period === period) {
        const key = this.usageKey(limit.dimension, limit.period)
        this.usage.set(key, 0)
        this.periodStart.set(key, Date.now())
      }
    }
    this.logger.info('Budget period reset', { period })
  }

  getConfig(): BudgetConfig {
    return this.config
  }

  /**
   * 生成使用量 key
   */
  private usageKey(dimension: BudgetDimension, period: BudgetPeriod): string {
    return `${dimension}:${period}`
  }

  /**
   * 判断周期是否需要重置
   */
  private shouldResetPeriod(period: BudgetPeriod, key: string): boolean {
    const start = this.periodStart.get(key)
    if (!start) return true

    const now = Date.now()
    const elapsed = now - start

    switch (period) {
      case 'per_cycle':
        // per_cycle 由外部显式重置（循环开始时调用 resetPeriod）
        return false
      case 'per_minute':
        return elapsed >= 60_000
      case 'per_hour':
        return elapsed >= 3_600_000
      case 'per_day':
        return elapsed >= 86_400_000
      default:
        return false
    }
  }

  /**
   * 获取某个限制的当前使用情况
   */
  private getUsageForLimit(limit: BudgetLimit): BudgetUsage {
    const key = this.usageKey(limit.dimension, limit.period)

    // 检查是否需要重置周期
    if (this.shouldResetPeriod(limit.period, key)) {
      this.usage.set(key, 0)
      this.periodStart.set(key, Date.now())
    }

    let used = this.usage.get(key) ?? 0

    // 内存维度从进程实时获取
    if (limit.dimension === 'memory_mb') {
      used = Math.round(process.memoryUsage().rss / 1024 / 1024)
    }

    const utilization = limit.hardLimit > 0 ? used / limit.hardLimit : 0

    return {
      dimension: limit.dimension,
      period: limit.period,
      used,
      softLimit: limit.softLimit,
      hardLimit: limit.hardLimit,
      utilization,
      overSoftLimit: used >= limit.softLimit,
      overHardLimit: used >= limit.hardLimit,
    }
  }
}
