import { describe, it, expect, beforeEach } from 'vitest'
import { BaseUseCase } from '../../../src/core_layer/logic/base_use_case.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

class TestUseCase extends BaseUseCase<undefined, string> {
  async execute(_input: undefined): Promise<string> { return 'success' }
}

describe('BaseUseCase', () => {
  let test_use_case: TestUseCase
  let logger: ConsoleLogger
  let mock_config: AppConfig

  beforeEach(() => {
    mock_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mock_config, 'test_use_case_logger')
    test_use_case = new TestUseCase(logger)
  })

  it('should initialize successfully', () => {
    expect(test_use_case).toBeInstanceOf(TestUseCase)
  })

  it('should execute use case successfully', async () => {
    const result = await test_use_case.execute()
    expect(result).toEqual('success')
  })
})
