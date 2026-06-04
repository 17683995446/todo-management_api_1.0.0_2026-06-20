import type { Logger } from './logger.js'

type ShutdownHook = () => Promise<void>

export class ShutdownManager {
  private hooks: ShutdownHook[] = []
  private logger: Logger
  private isShuttingDown = false

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace('ShutdownManager initialized', {}, 15, 'constructor')
    this.setupSignalHandlers()
  }

  private setupSignalHandlers(): void {
    this.logger.trace('Setting up signal handlers', {}, 19, 'setupSignalHandlers')
    const signals = ['SIGINT', 'SIGTERM']
    for (const signal of signals) {
      this.logger.trace(`Registering listener for ${signal}`, {}, 23, 'setupSignalHandlers')
      process.on(signal, async () => {
        this.logger.trace(`Received ${signal}`, {}, 25, 'signal-handler')
        this.logger.info(`Received ${signal}, initiating shutdown`, {}, 26, 'signal-handler')
        await this.shutdown()
      })
    }
  }

  addHook(hook: ShutdownHook): void {
    this.logger.trace('Adding shutdown hook', { hook: typeof hook }, 33, 'addHook')
    this.hooks.push(hook)
  }

  async shutdown(): Promise<void> {
    this.logger.trace('Shutdown requested', {}, 38, 'shutdown')
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress', {}, 40, 'shutdown')
      return
    }
    this.isShuttingDown = true
    this.logger.info('Running shutdown hooks', {}, 44, 'shutdown')
    for (let i = this.hooks.length - 1; i >= 0; i--) {
      const hook = this.hooks[i]
      try {
        this.logger.trace('Executing shutdown hook', { index: i }, 47, 'shutdown')
        await hook()
      } catch (error) {
        this.logger.error('Error running shutdown hook', { error, index: i }, 50, 'shutdown')
      }
    }
    this.logger.info('Shutdown complete', {}, 54, 'shutdown')
    this.logger.trace('Exiting process', {}, 55, 'shutdown')
    process.exit(0)
  }
}
