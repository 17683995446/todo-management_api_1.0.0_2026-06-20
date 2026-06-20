import { describe, it, expect, beforeEach } from 'vitest'
import { BaseOutputRenderer } from '../../../../src/presentation_layer/cli/output/base_output_renderer.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

class TestOutputRenderer extends BaseOutputRenderer {
  async render(data: unknown): Promise<void> {}
}

describe('BaseOutputRenderer', () => {
  let test_output_renderer: TestOutputRenderer
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
    logger = new ConsoleLogger(mock_config, 'test_output_logger')
    test_output_renderer = new TestOutputRenderer(logger)
  })

  it('should initialize successfully', () => {
    expect(test_output_renderer).toBeInstanceOf(TestOutputRenderer)
  })
})
