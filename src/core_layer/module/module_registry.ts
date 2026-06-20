import type { Logger } from '../logic/logger.js'
import type {
  IModule,
  IModuleFactory,
  ModuleMetadata,
  ModuleState,
} from './module.interface.js'

/**
 * 模块注册表
 * 像电子元器件插座板一样，可以注册和查找模块！
 */
export class ModuleRegistry {
  private factories: Map<string, IModuleFactory> = new Map()
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace('ModuleRegistry initialized', {}, 16, 'constructor')
  }

  /**
   * 注册模块工厂
   * @param factory 模块工厂
   */
  registerFactory(factory: IModuleFactory): void {
    const meta = factory.getFactoryMetadata()
    this.logger.trace(
      'Registering module factory',
      { id: meta.id, name: meta.name },
      25,
      'registerFactory',
    )
    this.factories.set(meta.id, factory)
  }

  /**
   * 取消注册模块工厂
   * @param moduleId 模块 ID
   */
  unregisterFactory(moduleId: string): void {
    this.logger.trace(
      'Unregistering module factory',
      { id: moduleId },
      34,
      'unregisterFactory',
    )
    this.factories.delete(moduleId)
  }

  /**
   * 获取模块工厂
   * @param moduleId 模块 ID
   */
  getFactory(moduleId: string): IModuleFactory | null {
    return this.factories.get(moduleId) || null
  }

  /**
   * 获取所有已注册的模块元数据
   */
  getAllFactoryMetadata(): ModuleMetadata[] {
    return Array.from(this.factories.values()).map((f) =>
      f.getFactoryMetadata(),
    )
  }

  /**
   * 创建模块实例
   * @param moduleId 模块 ID
   */
  createModule(moduleId: string): IModule | null {
    const factory = this.factories.get(moduleId)
    if (!factory) {
      this.logger.warn(
        'Module factory not found',
        { id: moduleId },
        61,
        'createModule',
      )
      return null
    }
    return factory.createModule(this.logger)
  }
}

/**
 * 模块管理器
 * 管理模块的生命周期、依赖关系和组合
 */
export class ModuleManager {
  private registry: ModuleRegistry
  private modules: Map<string, IModule> = new Map()
  private logger: Logger
  private isBooted = false

  constructor(logger: Logger) {
    this.logger = logger
    this.registry = new ModuleRegistry(logger)
    this.logger.trace('ModuleManager initialized', {}, 80, 'constructor')
  }

  /**
   * 获取模块注册表
   */
  getRegistry(): ModuleRegistry {
    return this.registry
  }

  /**
   * 注册并创建模块
   * @param factory 模块工厂
   */
  async registerAndCreate(factory: IModuleFactory): Promise<IModule> {
    const meta = factory.getFactoryMetadata()
    this.registry.registerFactory(factory)

    const module = factory.createModule(this.logger)
    this.modules.set(meta.id, module)

    this.logger.trace(
      'Module registered and created',
      { id: meta.id },
      101,
      'registerAndCreate',
    )
    return module
  }

  /**
   * 按拓扑顺序启动所有模块（处理依赖）
   */
  async boot(): Promise<void> {
    if (this.isBooted) {
      this.logger.warn(
        'ModuleManager already booted',
        {},
        112,
        'boot',
      )
      return
    }

    this.logger.trace(
      'Starting module boot process',
      { moduleCount: this.modules.size },
      118,
      'boot',
    )

    // 按拓扑顺序排序（处理依赖）
    const sortedModules = this.topologicalSort()

    // 初始化所有模块
    for (const moduleId of sortedModules) {
      const module = this.modules.get(moduleId)
      if (!module) continue

      this.logger.trace(
        'Initializing module',
        { id: moduleId },
        131,
        'boot',
      )

      // 收集依赖模块
      const deps = new Map<string, IModule>()
      const meta = module.getMetadata()
      if (meta.dependencies) {
        for (const depId of meta.dependencies) {
          const dep = this.modules.get(depId)
          if (dep) {
            deps.set(depId, dep)
          }
        }
      }

      await module.initialize(deps, this.logger)
    }

    // 启动所有模块
    for (const moduleId of sortedModules) {
      const module = this.modules.get(moduleId)
      if (!module) continue

      this.logger.trace(
        'Starting module',
        { id: moduleId },
        154,
        'boot',
      )
      await module.start()
    }

    this.isBooted = true
    this.logger.info('ModuleManager boot complete', {}, 161, 'boot')
  }

  /**
   * 按拓扑顺序关闭所有模块
   */
  async shutdown(): Promise<void> {
    if (!this.isBooted) {
      this.logger.warn(
        'ModuleManager not booted',
        {},
        171,
        'shutdown',
      )
      return
    }

    this.logger.trace(
      'Starting module shutdown process',
      { moduleCount: this.modules.size },
      178,
      'shutdown',
    )

    // 关闭顺序与启动相反
    const sortedModules = [...this.topologicalSort()].reverse()

    for (const moduleId of sortedModules) {
      const module = this.modules.get(moduleId)
      if (!module) continue

      this.logger.trace(
        'Stopping module',
        { id: moduleId },
        191,
        'shutdown',
      )
      await module.stop()
    }

    this.isBooted = false
    this.logger.info('ModuleManager shutdown complete', {}, 198, 'shutdown')
  }

  /**
   * 获取模块实例
   * @param moduleId 模块 ID
   */
  getModule(moduleId: string): IModule | null {
    return this.modules.get(moduleId) || null
  }

  /**
   * 拓扑排序模块（处理依赖关系）
   */
  private topologicalSort(): string[] {
    const visited = new Set<string>()
    const order: string[] = []

    const visit = (moduleId: string): void => {
      if (visited.has(moduleId)) return
      visited.add(moduleId)

      const module = this.modules.get(moduleId)
      if (!module) return

      const meta = module.getMetadata()
      if (meta.dependencies) {
        for (const depId of meta.dependencies) {
          visit(depId)
        }
      }

      order.push(moduleId)
    }

    for (const moduleId of this.modules.keys()) {
      visit(moduleId)
    }

    return order
  }
}
