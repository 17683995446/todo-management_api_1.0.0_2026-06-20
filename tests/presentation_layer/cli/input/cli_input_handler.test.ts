import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CliInputHandler } from '../../../../src/presentation_layer/cli/input/cli_input_handler.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

describe('CliInputHandler', () => {
  let mock_config: AppConfig
  let logger: ConsoleLogger

  beforeEach(() => {
    mock_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mock_config, 'test-input-handler')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize successfully', () => {
    const handler = new CliInputHandler(logger)
    expect(handler).toBeInstanceOf(CliInputHandler)
    handler.close()
  })
})
