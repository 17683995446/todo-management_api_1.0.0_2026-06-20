import { describe, it, expect, beforeEach } from 'vitest'
import { BasicInputSanitizer } from '../../../src/core_layer/logic/input_sanitizer.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('BasicInputSanitizer', () => {
  let sanitizer: BasicInputSanitizer

  beforeEach(() => {
    const config: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    const logger = new ConsoleLogger(config, 'sanitizer-test-logger')
    sanitizer = new BasicInputSanitizer(logger)
  })

  it('should sanitize strings', () => {
    expect(sanitizer.sanitizeString('  <script>  ')).toEqual('script')
  })

  it('should sanitize numbers', () => {
    expect(sanitizer.sanitizeNumber(Number.NaN)).toEqual(0)
    expect(sanitizer.sanitizeNumber(42)).toEqual(42)
  })

  it('should sanitize booleans', () => {
    expect(sanitizer.sanitizeBoolean(undefined as unknown as boolean)).toEqual(false)
    expect(sanitizer.sanitizeBoolean(true)).toEqual(true)
  })
})
