import type { Logger } from '../../core_layer/logic/logger.js'
import type {
  IWatchdog,
  WatchdogHealth,
  WatchdogStats,
} from '../agent.interface.js'

/**
 * 看门狗配置
 */
export interface WatchdogConfig {
  /** 健康检查间隔（毫秒） */
  checkIntervalMs: number
  /** 最大连续失败次数，超过后触发恢复 */
  maxConsecutiveFailures: number
}

/**
 * 默认看门狗配置
 */
export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
  checkIntervalMs: 30_000,
  maxConsecutiveFailures: 3,
}

/**
 * 永续运行看门狗
 *
 * 监控 Agent 健康，自动恢复故障，确保持久运行。
 *
 * 设计原则：
 * - 定期执行健康检查（通过 onCheck 注册的回调）
 * - 连续失败超过阈值时触发恢复（通过 onRecover 注册的回调）
 * - 恢复后重置失败计数，避免重复恢复
 * - 所有操作错误安全，看门狗自身不会崩溃
 * - 支持手动触发恢复（triggerRecovery）
 *
 * 这是 Agent "永远运行不停止"的保障：
 * 即使 Agent 循环出现故障，看门狗也能检测并恢复。
 */
export class Watchdog implements IWatchdog {
  private checkCallback: (() => Promise<boolean>) | null = null
  private recoverCallback: (() => Promise<void>) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private recovering = false

  private stats: WatchdogStats = {
    totalChecks: 0,
    healthyChecks: 0,
    recoveryCount: 0,
    consecutiveFailures: 0,
  }

  constructor(
    private readonly logger: Logger,
    private readonly config: WatchdogConfig = DEFAULT_WATCHDOG_CONFIG,
  ) {}

  get checkIntervalMs(): number {
    return this.config.checkIntervalMs
  }

  get maxConsecutiveFailures(): number {
    return this.config.maxConsecutiveFailures
  }

  start(): void {
    if (this.running) {
      this.logger.warn('Watchdog already running')
      return
    }

    this.running = true
    this.timer = setInterval(() => {
      this.runCheck().catch((err) => {
        this.logger.error('Watchdog check failed', { error: String(err) })
      })
    }, this.config.checkIntervalMs)

    this.logger.info('Watchdog started', {
      intervalMs: this.config.checkIntervalMs,
      maxFailures: this.config.maxConsecutiveFailures,
    })
  }

  stop(): void {
    if (!this.running) return

    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    this.logger.info('Watchdog stopped')
  }

  isRunning(): boolean {
    return this.running
  }

  async checkHealth(): Promise<WatchdogHealth> {
    return this.runCheck()
  }

  onRecover(callback: () => Promise<void>): void {
    this.recoverCallback = callback
    this.logger.info('Recovery callback registered')
  }

  onCheck(callback: () => Promise<boolean>): void {
    this.checkCallback = callback
    this.logger.info('Health check callback registered')
  }

  getStats(): WatchdogStats {
    return { ...this.stats }
  }

  async triggerRecovery(): Promise<void> {
    await this.executeRecovery('manual trigger')
  }

  /**
   * 执行一次健康检查
   */
  private async runCheck(): Promise<WatchdogHealth> {
    this.stats.totalChecks++
    this.stats.lastCheckAt = new Date().toISOString()

    let healthy = false
    let failureReason: string | undefined

    if (!this.checkCallback) {
      // 没有注册检查回调，视为健康
      healthy = true
    } else {
      try {
        healthy = await this.checkCallback()
        if (!healthy) {
          failureReason = 'Health check callback returned false'
        }
      } catch (err) {
        failureReason = err instanceof Error ? err.message : String(err)
        this.logger.error('Health check callback threw', {
          error: failureReason,
        })
      }
    }

    if (healthy) {
      this.stats.healthyChecks++
      this.stats.consecutiveFailures = 0
    } else {
      this.stats.consecutiveFailures++
      this.logger.warn('Health check failed', {
        consecutiveFailures: this.stats.consecutiveFailures,
        maxFailures: this.maxConsecutiveFailures,
        reason: failureReason,
      })

      // 检查是否需要触发恢复
      if (this.stats.consecutiveFailures >= this.maxConsecutiveFailures) {
        await this.executeRecovery(
          failureReason ?? 'max consecutive failures reached',
        )
      }
    }

    return {
      healthy,
      checkedAt: this.stats.lastCheckAt,
      failureReason,
      consecutiveFailures: this.stats.consecutiveFailures,
    }
  }

  /**
   * 执行恢复操作
   */
  private async executeRecovery(reason: string): Promise<void> {
    // 防止重入
    if (this.recovering) {
      this.logger.warn('Recovery already in progress, skipping')
      return
    }

    this.recovering = true
    this.stats.recoveryCount++
    this.stats.lastRecoveryAt = new Date().toISOString()

    this.logger.warn('Triggering recovery', {
      reason,
      recoveryCount: this.stats.recoveryCount,
    })

    try {
      if (this.recoverCallback) {
        await this.recoverCallback()
        this.logger.info('Recovery completed successfully')
      } else {
        this.logger.warn('No recovery callback registered')
      }

      // 恢复后重置失败计数
      this.stats.consecutiveFailures = 0
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.logger.error('Recovery failed', { error: errorMsg })
      // 恢复失败不重置计数，下次检查会再次尝试
    } finally {
      this.recovering = false
    }
  }
}
