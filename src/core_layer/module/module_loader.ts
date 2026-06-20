import type { Logger } from '../logic/logger.js'
import type { IModuleFactory, IModule } from './module.interface.js'
import { ModuleRegistry, ModuleManager } from './module_registry.js'

/**
 * 模块加载器 - 像乐高积木一样组装和管理模块！
 * 
 * 特点：
 * - 自动发现和注册模块工厂
 * - 拓扑排序管理依赖关系
 * - 完整的生命周期管理
 */
export class ModuleLoader {
  private registry: ModuleRegistry
  private manager: ModuleManager
  private logger: Logger
  private factories: Map<string, IModuleFactory> = new Map()

  constructor(logger: Logger) {
    this.logger = logger
    this.registry = new ModuleRegistry(logger)
    this.manager = new ModuleManager(logger)
    this.logger.trace('ModuleLoader initialized', {}, 21, 'constructor')
  }

  /**
   * 注册模块工厂 - 就像把元器件放入插座板
   */
  registerFactory(factory: IModuleFactory): ModuleLoader {
    const meta = factory.getFactoryMetadata()
    this.logger.trace(
      'Registering module factory',
      { id: meta.id, name: meta.name, version: meta.version },
      33,
      'registerFactory'
    )
    this.factories.set(meta.id, factory)
    this.registry.registerFactory(factory)
    return this // 链式调用，像搭积木一样！
  }

  /**
   * 批量注册模块工厂
   */
  registerFactories(factories: IModuleFactory[]): ModuleLoader {
    for (const factory of factories) {
      this.registerFactory(factory)
    }
    return this
  }

  /**
   * 组装并启动应用 - 像组装机器人一样！
   */
  async assembleAndBoot(): Promise<ModuleManager> {
    this.logger.trace('Assembling and booting modules...', {}, 54, 'assembleAndBoot')

    // 第一步：注册所有模块并创建实例
    for (const [id, factory] of this.factories) {
      this.logger.trace(
        'Creating module instance',
        { id },
        61,
        'assembleAndBoot'
      )
      await this.manager.registerAndCreate(factory)
    }

    // 第二步：按拓扑顺序启动所有模块（依赖在前）
    this.logger.trace('Booting modules in topological order', {}, 68, 'assembleAndBoot')
    await this.manager.boot()

    this.logger.info('🎉 Application successfully assembled and booted!', {}, 71, 'assembleAndBoot')
    return this.manager
  }

  /**
   * 停止并卸载所有模块
   */
  async shutdown(): Promise<void> {
    this.logger.trace('Shutting down module loader...', {}, 78, 'shutdown')
    await this.manager.shutdown()
    this.logger.info('Module loader shutdown complete', {}, 80, 'shutdown')
  }

  /**
   * 获取已注册的模块元数据
   */
  getRegisteredModules(): Array<{ id: string; name: string; version: string; description?: string }> {
    return Array.from(this.factories.values()).map(f => f.getFactoryMetadata())
  }

  /**
   * 获取模块管理器
   */
  getManager(): ModuleManager {
    return this.manager
  }
}
