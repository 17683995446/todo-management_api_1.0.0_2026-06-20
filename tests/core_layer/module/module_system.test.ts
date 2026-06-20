import { describe, it, expect, beforeEach } from 'vitest'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'
import { BaseModule } from '../../../src/core_layer/module/base_module.js'
import { ModuleRegistry, ModuleManager } from '../../../src/core_layer/module/module_registry.js'
import { ConfigModuleFactory } from '../../../src/modules/config_module.js'
import { RepositoryModuleFactory } from '../../../src/modules/repository_module.js'

describe('Module System', () => {
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rateLimit: 100 },
    }
    logger = new ConsoleLogger(mockConfig, 'test-module-logger')
  })

  describe('ModuleRegistry', () => {
    it('should register and create modules', () => {
      const registry = new ModuleRegistry(logger)
      const factory = new ConfigModuleFactory()

      registry.registerFactory(factory)
      
      const meta = registry.getFactory('config')
      expect(meta).toBeTruthy()
    })

    it('should return null for unregistered factory', () => {
      const registry = new ModuleRegistry(logger)
      
      const factory = registry.getFactory('nonexistent')
      expect(factory).toBeNull()
    })
  })

  describe('ModuleManager', () => {
    it('should boot and shutdown modules', async () => {
      const manager = new ModuleManager(logger)

      // 注册模块
      await manager.registerAndCreate(new ConfigModuleFactory())
      await manager.registerAndCreate(new RepositoryModuleFactory())

      // 启动
      await manager.boot()

      // 尝试获取模块
      const configModule = manager.getModule('config')
      expect(configModule).toBeTruthy()

      const repoModule = manager.getModule('repository')
      expect(repoModule).toBeTruthy()

      // 关闭
      await manager.shutdown()
    })

    it('should allow getting service from module', async () => {
      const manager = new ModuleManager(logger)
      await manager.registerAndCreate(new ConfigModuleFactory())
      await manager.boot()

      const configModule = manager.getModule('config')
      const config = configModule?.getService<AppConfig>('appConfig')
      
      expect(config).toBeTruthy()

      await manager.shutdown()
    })
  })

  describe('BaseModule', () => {
    it('should handle module lifecycle', async () => {
      class TestModule extends BaseModule {
        public initialized = false
        public started = false
        public stopped = false

        constructor() {
          super({ id: 'test', name: 'Test Module', version: '1.0.0' })
        }

        protected async onInitialize(): Promise<void> {
          this.initialized = true
        }

        protected async onStart(): Promise<void> {
          this.started = true
        }

        protected async onStop(): Promise<void> {
          this.stopped = true
        }
      }

      const testModule = new TestModule()

      await testModule.initialize(new Map(), logger)
      expect(testModule.initialized).toBeTruthy()

      await testModule.start()
      expect(testModule.started).toBeTruthy()

      await testModule.stop()
      expect(testModule.stopped).toBeTruthy()
    })
  })
})
