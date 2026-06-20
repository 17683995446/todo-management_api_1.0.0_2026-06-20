import { describe, it, expect } from 'vitest'
import { BasicInputSanitizer } from '../../../src/core_layer/logic/input_sanitizer.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'
import * as fc from 'fast-check'

describe('InputSanitizer Property-Based Tests', () => {
  const mockConfig: AppConfig = {
    app: { name: 'test', version: '1.0.0', debug: true },
    server: { host: 'localhost', port: 3000 },
    database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
    logging: { level: 'trace', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 }
  }
  const logger = new ConsoleLogger(mockConfig, 'sanitizer-property-test')
  const sanitizer = new BasicInputSanitizer(logger)

  it('sanitizeString: should always return a string', () => {
    fc.assert(
      fc.property(fc.anything(), (input: unknown) => {
        const result = sanitizer.sanitizeString(input)
        expect(typeof result).toBe('string')
      })
    )
  })

  it('sanitizeNumber: should always return a number', () => {
    fc.assert(
      fc.property(fc.anything(), (input: unknown) => {
        const result = sanitizer.sanitizeNumber(input)
        expect(typeof result).toBe('number')
        expect(Number.isFinite(result)).toBe(true)
      })
    )
  })

  it('sanitizeBoolean: should always return a boolean', () => {
    fc.assert(
      fc.property(fc.anything(), (input: unknown) => {
        const result = sanitizer.sanitizeBoolean(input)
        expect(typeof result).toBe('boolean')
      })
    )
  })
})
