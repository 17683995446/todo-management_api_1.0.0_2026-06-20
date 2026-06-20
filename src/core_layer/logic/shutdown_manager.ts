import type { Logger } from './logger.js'

type ShutdownHook = () => Promise<void>

/** 已注册信号处理器的标记，防止多个 ShutdownManager 实例重复注册 */
let signalHandlersRegistered = false

/**
 * 重置信号处理器注册状态（仅供测试使用）
 */
export function _resetSignalHandlerRegistration(): void {
  signalHandlersRegistered = false
}

export class ShutdownManager {
  private hooks: ShutdownHook[] = []
  private logger: Logger
  private isShuttingDown = false
  private shouldExitOnShutdown: boolean

  constructor(logger: Logger, shouldExitOnShutdown = true) {
    this.logger = logger
    this.shouldExitOnShutdown = shouldExitOnShutdown
    this.logger.trace('ShutdownManager initialized', {}, 18, 'constructor')
    this.setupSignalHandlers()
  }

  private setupSignalHandlers(): void {
    this.logger.trace('Setting up signal handlers', {}, 22, 'setupSignalHandlers')
    if (signalHandlersRegistered) {
      this.logger.trace('Signal handlers already registered globally, skipping', {}, 24, 'setupSignalHandlers')
      return
    }
    signalHandlersRegistered = true
    const signals = ['SIGINT', 'SIGTERM']
    for (const signal of signals) {
      this.logger.trace(`Registering listener for ${signal}`, {}, 26, 'setupSignalHandlers')
      process.on(signal, () => {
        this.logger.trace(`Received ${signal}`, {}, 28, 'signal-handler')
        this.logger.info(`Received ${signal}, initiating shutdown`, {}, 29, 'signal-handler')
        this.shutdown().catch(err => {
          this.logger.error('Error during shutdown', { error: err }, 33, 'signal-handler')
          if (this.shouldExitOnShutdown) {
            process.exit(1)
          }
        })
      })
    }
  }

  addHook(hook: ShutdownHook): void {
    this.logger.trace('Adding shutdown hook', { hook: typeof hook }, 41, 'addHook')
    this.hooks.push(hook)
  }

  async shutdown(): Promise<void> {
    this.logger.trace('Shutdown requested', {}, 46, 'shutdown')
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress', {}, 48, 'shutdown')
      return
    }
    this.isShuttingDown = true
    this.logger.info('Running shutdown hooks', {}, 52, 'shutdown')
    for (let i = this.hooks.length - 1; i >= 0; i--) {
      const hook = this.hooks[i]
      try {
        this.logger.trace('Executing shutdown hook', { index: i }, 55, 'shutdown')
        await hook()
      } catch (error) {
        this.logger.error('Error running shutdown hook', { error, index: i }, 58, 'shutdown')
      }
    }
    this.logger.info('Shutdown complete', {}, 62, 'shutdown')
    this.logger.trace('Shutdown complete', {}, 63, 'shutdown')
    if (this.shouldExitOnShutdown) {
      this.logger.trace('Exiting process', {}, 65, 'shutdown')
      process.exit(0)
    }
  }
}
