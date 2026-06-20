import { describe, it, expect, beforeEach } from 'vitest'
import { BaseInputHandler } from '../../../../src/presentation_layer/cli/input/base_input_handler.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

class TestInputHandler extends BaseInputHandler {
  async read_input(): Promise<string> { return 'test input' }
}

describe('BaseInputHandler', () => {
  let test_input_handler: TestInputHandler
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
    logger = new ConsoleLogger(mock_config, 'test_input_logger')
    test_input_handler = new TestInputHandler(logger)
  })

  it('should initialize successfully', () => {
    expect(test_input_handler).toBeInstanceOf(TestInputHandler)
  })
})
