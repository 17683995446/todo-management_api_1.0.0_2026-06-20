import type { Logger } from './logger.js'

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_CONFIG = 'INVALID_CONFIG',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RANDOM_FAILURE = 'RANDOM_FAILURE'
}

export interface ErrorInjectionConfig {
  enabled: boolean
  errorType?: ErrorType
  failureRate?: number // 0 to 1
  delayMs?: number // artificial delay in ms
}

export class ErrorInjector {
  private config: ErrorInjectionConfig
  private logger: Logger
  private callCount = 0

  constructor(logger: Logger, config?: Partial<ErrorInjectionConfig>) {
    this.logger = logger
    this.config = {
      enabled: false,
      errorType: ErrorType.RANDOM_FAILURE,
      failureRate: 0.1,
      delayMs: 0,
      ...config
    }
    this.logger.trace('ErrorInjector initialized', { config: this.config }, 21, 'constructor')
  }

  setConfig(config: Partial<ErrorInjectionConfig>): void {
    this.logger.trace('ErrorInjector.setConfig called', { config }, 25, 'setConfig')
    this.config = { ...this.config, ...config }
    this.logger.trace('ErrorInjector.setConfig complete', { newConfig: this.config }, 27, 'setConfig')
  }

  enable(): void {
    this.logger.trace('ErrorInjector.enable called', {}, 30, 'enable')
    this.config.enabled = true
  }

  disable(): void {
    this.logger.trace('ErrorInjector.disable called', {}, 34, 'disable')
    this.config.enabled = false
  }

  reset(): void {
    this.logger.trace('ErrorInjector.reset called', {}, 38, 'reset')
    this.callCount = 0
    this.config = {
      enabled: false,
      errorType: ErrorType.RANDOM_FAILURE,
      failureRate: 0.1,
      delayMs: 0
    }
  }

  private shouldInjectError(): boolean {
    if (!this.config.enabled) return false
    this.callCount++
    return Math.random() < (this.config.failureRate || 0)
  }

  private async applyDelay(): Promise<void> {
    if (this.config.delayMs && this.config.delayMs > 0) {
      this.logger.trace('ErrorInjector applying delay', { delayMs: this.config.delayMs }, 57, 'applyDelay')
      await new Promise(resolve => setTimeout(resolve, this.config.delayMs))
    }
  }

  async injectError(): Promise<void> {
    this.logger.trace('ErrorInjector.injectError called', {}, 62, 'injectError')
    
    await this.applyDelay()
    
    if (this.shouldInjectError()) {
      const error = this.createError()
      this.logger.error('Error injection triggered', { errorType: this.config.errorType, callCount: this.callCount }, 67, 'injectError')
      throw error
    }
  }

  private createError(): Error {
    switch (this.config.errorType) {
      case ErrorType.NETWORK_ERROR:
        return new Error('Network error: connection refused')
      case ErrorType.FILE_NOT_FOUND:
        return new Error('File not found')
      case ErrorType.INVALID_CONFIG:
        return new Error('Invalid configuration')
      case ErrorType.TIMEOUT:
        return new Error('Request timeout')
      case ErrorType.PERMISSION_DENIED:
        return new Error('Permission denied')
      default: {
        const randomErrors = [
          new Error('Random failure occurred'),
          new Error('Unexpected error'),
          new Error('Something went wrong')
        ]
        return randomErrors[Math.floor(Math.random() * randomErrors.length)]
      }
    }
  }

  async wrapOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.logger.trace('ErrorInjector.wrapOperation called', {}, 96, 'wrapOperation')
    await this.injectError()
    return operation()
  }
}
