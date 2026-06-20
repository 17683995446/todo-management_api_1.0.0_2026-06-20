import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'
import { ModuleLoader } from '../../../src/core_layer/module/module_loader.js'
import { ConfigModuleFactory } from '../../../src/modules/config_module.js'
import { CacheModuleFactory } from '../../../src/modules/cache_module.js'
import { IOModuleFactory } from '../../../src/modules/io_module.js'
import { RepositoryModuleFactory } from '../../../src/modules/repository_module.js'

describe('🧩 乐高式模块化系统完整测试', () => {
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '0.0.0', debug: true },
      server: { host: 'localhost', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'info', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'test-modular-system')
  })

  it('应该能够像搭积木一样注册多个模块工厂', () => {
    const loader = new ModuleLoader(logger)

    // 链式调用注册多个工厂，像搭积木！
    loader
      .registerFactory(new ConfigModuleFactory())
      .registerFactory(new CacheModuleFactory())
      .registerFactory(new IOModuleFactory())

    // 验证注册
    const modules = loader.getRegisteredModules()
    expect(modules.length).toBe(3)
    expect(modules.map(m => m.id)).toEqual(['config', 'cache', 'io'])
  })

  it('应该能够组装并启动完整的模块化应用', async () => {
    const loader = new ModuleLoader(logger)

    loader
      .registerFactory(new ConfigModuleFactory())
      .registerFactory(new CacheModuleFactory())
      .registerFactory(new RepositoryModuleFactory())

    // 组装并启动
    const manager = await loader.assembleAndBoot()

    // 验证所有模块已启动
    expect(manager.getModule('config')).toBeDefined()
    expect(manager.getModule('cache')).toBeDefined()
    expect(manager.getModule('repository')).toBeDefined()

    // 优雅关闭
    await loader.shutdown()
  })

  it('模块之间应该能够通过服务获取交互', async () => {
    const loader = new ModuleLoader(logger)

    loader
      .registerFactory(new ConfigModuleFactory())
      .registerFactory(new CacheModuleFactory())

    const manager = await loader.assembleAndBoot()

    // 从Config模块获取配置服务
    const configModule = manager.getModule('config')
    const config = configModule?.getService('appConfig')
    expect(config).toBeDefined()

    // 从Cache模块获取缓存服务
    const cacheModule = manager.getModule('cache')
    const cache = cacheModule?.getService('cache')
    expect(cache).toBeDefined()

    await loader.shutdown()
  })

  it('支持不同的模块组合配置', async () => {
    // 配置1：最小化版本
    const loader1 = new ModuleLoader(logger)
    loader1.registerFactory(new ConfigModuleFactory())
    await loader1.assembleAndBoot()
    expect(loader1.getRegisteredModules().length).toBe(1)
    await loader1.shutdown()

    // 配置2：完整版本
    const loader2 = new ModuleLoader(logger)
    loader2
      .registerFactory(new ConfigModuleFactory())
      .registerFactory(new CacheModuleFactory())
      .registerFactory(new IOModuleFactory())
      .registerFactory(new RepositoryModuleFactory())
    await loader2.assembleAndBoot()
    expect(loader2.getRegisteredModules().length).toBe(4)
    await loader2.shutdown()
  })

  it('完整生命周期：初始化 -> 启动 -> 停止', async () => {
    const loader = new ModuleLoader(logger)
    loader.registerFactory(new ConfigModuleFactory())

    // 启动
    const manager = await loader.assembleAndBoot()
    const module = manager.getModule('config')
    expect(module).toBeDefined()

    // 服务可用
    const service = module?.getService('appConfig')
    expect(service).toBeDefined()

    // 关闭
    await loader.shutdown()
  })
})

describe('📦 模块元数据与接口验证', () => {
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '0.0.0', debug: true },
      server: { host: 'localhost', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'info', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'test-metadata')
  })

  it('所有模块应该有完整的元数据', () => {
    const factories = [
      new ConfigModuleFactory(),
      new CacheModuleFactory(),
      new IOModuleFactory(),
      new RepositoryModuleFactory()
    ]

    for (const factory of factories) {
      const meta = factory.getFactoryMetadata()
      expect(meta.id).toBeTruthy()
      expect(meta.name).toBeTruthy()
      expect(meta.version).toBeTruthy()
      expect(meta.description).toBeTruthy()
    }
  })

  it('模块工厂可以创建模块实例', () => {
    const factory = new ConfigModuleFactory()
    const module = factory.createModule(logger)

    expect(module.getMetadata().id).toBe('config')
    expect(typeof module.getState).toBe('function')
    expect(typeof module.initialize).toBe('function')
    expect(typeof module.start).toBe('function')
    expect(typeof module.stop).toBe('function')
  })
})
