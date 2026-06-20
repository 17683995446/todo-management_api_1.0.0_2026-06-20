import { describe, it, expect, vi } from 'vitest'
import { GetConfigUseCase, type GetConfigRequest } from '../../../src/core_layer/logic/get_config_use_case.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('GetConfigUseCase', () => {
  it('should return config', async () => {
    const mockConfig: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'info', format: 'json' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    const logger = new ConsoleLogger(mockConfig, 'test-logger')
    const useCase = new GetConfigUseCase(logger)
    const request: GetConfigRequest = { env: 'development' }
    const result = await useCase.execute(request)
    expect(result.config.app.name).toBeDefined()
  })
})
