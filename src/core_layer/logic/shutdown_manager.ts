import type { Logger } from './logger.js'

type ShutdownHook = () => Promise<void>

export class ShutdownManager {
  private hooks: ShutdownHook[] = []
  private logger: Logger
  private isShuttingDown = false

  constructor(logger: Logger) {
    this.logger = logger
    this.setupSignalHandlers()
  }

  private setupSignalHandlers(): void {
    const signals = ['SIGINT', 'SIGTERM']
    for (const signal of signals) {
      process.on(signal, async () => {
        this.logger.info(`Received ${signal}, initiating shutdown`)
        await this.shutdown()
      })
    }
  }

  addHook(hook: ShutdownHook): void {
    this.hooks.push(hook)
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress')
      return
    }
    this.isShuttingDown = true
    this.logger.info('Running shutdown hooks')
    for (const hook of this.hooks.reverse()) {
      try {
        await hook()
      } catch (error) {
        this.logger.error('Error running shutdown hook', { error })
      }
    }
    this.logger.info('Shutdown complete')
    process.exit(0)
  }
}
