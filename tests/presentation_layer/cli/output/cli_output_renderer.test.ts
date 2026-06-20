import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CliOutputRenderer } from '../../../../src/presentation_layer/cli/output/cli_output_renderer.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

describe('CliOutputRenderer', () => {
  let mock_config: AppConfig
  let logger: ConsoleLogger
  let renderer: CliOutputRenderer

  beforeEach(() => {
    mock_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mock_config, 'test-output-renderer')
    renderer = new CliOutputRenderer(logger)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render strings successfully', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await renderer.render('Hello, World!')
    expect(consoleLogSpy).toHaveBeenCalledWith('Hello, World!')
    consoleLogSpy.mockRestore()
  })

  it('should render objects as JSON', async () => {
    const testObj = { key: 'value', number: 42 }
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await renderer.render(testObj)
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(testObj, null, 2))
    consoleLogSpy.mockRestore()
  })
})
