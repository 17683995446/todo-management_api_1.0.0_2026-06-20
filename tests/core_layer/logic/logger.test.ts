import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsoleLogger, LogLevel } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('Logger', () => {
  let mockConfig: AppConfig
  let consoleLogSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'debug', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should log debug messages when level is debug', () => {
    const logger = new ConsoleLogger(mockConfig)
    logger.debug('test debug')
    expect(consoleLogSpy).toHaveBeenCalled()
  })

  it('should not log debug messages when level is info', () => {
    mockConfig.logging.level = 'info'
    const logger = new ConsoleLogger(mockConfig)
    logger.debug('test debug')
    expect(consoleLogSpy).not.toHaveBeenCalled()
  })

  it('should log error messages to console.error', () => {
    const logger = new ConsoleLogger(mockConfig)
    logger.error('test error')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
