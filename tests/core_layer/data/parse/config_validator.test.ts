import { describe, it, expect } from 'vitest'
import { validate_config } from '../../../../src/core_layer/data/parse/config_validator.js'

describe('config_validator', () => {
  it('should validate a valid config', () => {
    const valid_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'debug', format: 'json' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    const result = validate_config(valid_config)
    expect(result).toEqual(valid_config)
  })

  it('should throw for invalid port', () => {
    const invalid_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 99999 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'debug', format: 'json' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    expect(() => validate_config(invalid_config)).toThrow()
  })
})
