import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShutdownManager } from '../../../src/core_layer/logic/shutdown_manager.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

describe('ShutdownManager', () => {
  let mockConfig: AppConfig
  let logger: ConsoleLogger

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'debug', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig)
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  it('should add and run shutdown hooks', async () => {
    const manager = new ShutdownManager(logger, false) // 测试时不退出进程
    const hook = vi.fn(async () => {})
    manager.addHook(hook)
    await manager.shutdown()
    expect(hook).toHaveBeenCalled()
  })

  it('should not run shutdown twice', async () => {
    const manager = new ShutdownManager(logger, false) // 测试时不退出进程
    const hook = vi.fn(async () => {})
    manager.addHook(hook)
    await manager.shutdown()
    await manager.shutdown()
    expect(hook).toHaveBeenCalledTimes(1)
  })

  it('should not call process.exit when shouldExitOnShutdown is false', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const manager = new ShutdownManager(logger, false) // 测试时不退出进程
    await manager.shutdown()
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('should call process.exit when shouldExitOnShutdown is true', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const manager = new ShutdownManager(logger, true) // 测试时退出进程
    await manager.shutdown()
    expect(mockExit).toHaveBeenCalled()
  })
})
