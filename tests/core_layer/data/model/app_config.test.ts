import { describe, it, expect } from 'vitest'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

describe('AppConfig', () => {
  it('should have valid config structure', () => {
    const test_config: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'info', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    
    expect(test_config.app.name).toEqual('test')
    expect(test_config.server.port).toEqual(3000)
  })
})
