import { BaseModule } from '../core_layer/module/base_module.js'
import type { IModule, IModuleFactory, ModuleMetadata } from '../core_layer/module/module.interface.js'
import type { Logger } from '../core_layer/logic/logger.js'
import { InMemoryCache } from '../core_layer/logic/in_memory_cache.js'
import type { ICache } from '../core_layer/logic/cache.interface.js'

/**
 * 缓存模块 - 像CPU缓存一样的模块！
 */
export class CacheModule extends BaseModule {
  private cache!: ICache<string, unknown>

  constructor() {
    super({
      id: 'cache',
      name: 'Cache Module',
      version: '1.0.0',
      description: 'In-memory caching service with TTL support',
      dependencies: ['config'], // 依赖配置模块
      tags: ['cache', 'core']
    })
  }

  protected async onInitialize(): Promise<void> {
    this.logger.trace('Initializing cache module', {}, 26, 'onInitialize')
    
    // 创建缓存实例
    this.cache = new InMemoryCache(this.logger, 60000) // 默认60秒清理
    
    // 注册服务，让其他模块可以获取
    this.registerService('cache', this.cache)
    this.logger.trace('Cache module initialized', {}, 33, 'onInitialize')
  }

  protected async onStart(): Promise<void> {
    this.logger.trace('Cache module started', {}, 37, 'onStart')
  }

  protected async onStop(): Promise<void> {
    this.logger.trace('Shutting down cache module...', {}, 41, 'onStop')
    this.cache.close()
    this.logger.trace('Cache module stopped', {}, 44, 'onStop')
  }
}

/**
 * 缓存模块工厂
 */
export class CacheModuleFactory implements IModuleFactory {
  getFactoryMetadata(): ModuleMetadata {
    return {
      id: 'cache',
      name: 'Cache Module Factory',
      version: '1.0.0',
      description: 'Factory for creating Cache Module',
      tags: ['factory', 'cache']
    }
  }

  createModule(logger: Logger): IModule {
    return new CacheModule()
  }
}
