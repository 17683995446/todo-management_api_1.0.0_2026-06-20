import type { Logger } from '../../core_layer/logic/logger.js'
import type { IAgentScheduler } from '../agent.interface.js'

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  /** 触发间隔（毫秒） */
  intervalMs: number
}

/**
 * 默认调度器配置
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  intervalMs: 60_000,
}

/**
 * Agent 调度器
 *
 * 通过 Node.js 的 setInterval 周期性触发 Agent 循环。
 * 这是自驱系统的"心跳"——LLM 本身无法自启动，
 * 需要外部定时器来周期性"唤醒"Agent 执行 OODA 循环。
 *
 * 特性：
 * - 可配置的触发间隔
 * - 支持启动/停止
 * - 防重入：上一次循环未完成时不触发下一次
 * - 触发回调为异步，错误不会导致调度器崩溃
 */
export class TimerAgentScheduler implements IAgentScheduler {
  /** 定时器句柄 */
  private timer: ReturnType<typeof setInterval> | null = null
  /** 触发回调 */
  private triggerCallback: (() => Promise<void>) | null = null
  /** 是否正在执行上一次触发（防重入） */
  private running = false

  constructor(
    private readonly logger: Logger,
    private readonly config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
  ) {}

  get intervalMs(): number {
    return this.config.intervalMs
  }

  start(): void {
    if (this.timer !== null) {
      this.logger.warn('Scheduler already started', {})
      return
    }

    this.logger.info('Scheduler started', { intervalMs: this.config.intervalMs })

    this.timer = setInterval(async () => {
      await this.trigger()
    }, this.config.intervalMs)
  }

  stop(): void {
    if (this.timer === null) {
      return
    }

    clearInterval(this.timer)
    this.timer = null
    this.logger.info('Scheduler stopped', {})
  }

  isRunning(): boolean {
    return this.timer !== null
  }

  onTrigger(callback: () => Promise<void>): void {
    this.triggerCallback = callback
    this.logger.debug('Trigger callback registered', {})
  }

  /**
   * 执行一次触发
   * 防重入：如果上一次触发仍在执行，跳过本次
   */
  async trigger(): Promise<void> {
    if (this.running) {
      this.logger.debug('Skipping trigger: previous cycle still running', {})
      return
    }

    if (!this.triggerCallback) {
      this.logger.warn('No trigger callback registered', {})
      return
    }

    this.running = true
    try {
      await this.triggerCallback()
    } catch (err) {
      this.logger.error('Trigger callback failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.running = false
    }
  }
}
