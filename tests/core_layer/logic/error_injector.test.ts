import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorInjector, ErrorType } from '../../../src/core_layer/logic/error_injector.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('ErrorInjector', () => {
  let errorInjector: ErrorInjector
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rateLimit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'test-error-injector')
    errorInjector = new ErrorInjector(logger)
  })

  it('should initialize with default config', () => {
    expect(errorInjector).toBeInstanceOf(ErrorInjector)
  })

  it('should not inject error when disabled', async () => {
    errorInjector.disable()
    let threw = false
    try {
      await errorInjector.injectError()
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  it('should inject errors when enabled', async () => {
    errorInjector.setConfig({
      enabled: true,
      errorType: ErrorType.NETWORK_ERROR,
      failureRate: 1 // 100% failure rate
    })
    
    let threw = false
    try {
      await errorInjector.injectError()
    } catch (err) {
      threw = true
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain('Network error')
    }
    expect(threw).toBe(true)
  })

  it('should wrap operations with error injection', async () => {
    let operationCalled = false
    const testOperation = async () => {
      operationCalled = true
      return 'success'
    }

    errorInjector.disable()
    const result = await errorInjector.wrapOperation(testOperation)
    expect(result).toBe('success')
    expect(operationCalled).toBe(true)
  })

  it('should apply different error types', async () => {
    errorInjector.setConfig({
      enabled: true,
      errorType: ErrorType.FILE_NOT_FOUND,
      failureRate: 1
    })
    
    try {
      await errorInjector.injectError()
    } catch (err) {
      expect((err as Error).message).toContain('File not found')
    }

    errorInjector.setConfig({
      errorType: ErrorType.TIMEOUT
    })
    
    try {
      await errorInjector.injectError()
    } catch (err) {
      expect((err as Error).message).toContain('Request timeout')
    }
  })

  it('should reset to default config', () => {
    errorInjector.setConfig({
      enabled: true,
      errorType: ErrorType.PERMISSION_DENIED,
      failureRate: 0.5,
      delayMs: 100
    })
    
    errorInjector.reset()
    
    expect(() => errorInjector.injectError()).not.toThrow()
  })
})
