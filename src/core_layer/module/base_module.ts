import type { Logger } from '../logic/logger.js'
import { AppError, ErrorCode } from '../model/errors.js'
import {
  type IModule,
  type ModuleMetadata,
  ModuleState,
} from './module.interface.js'

/**
 * 基础模块抽象类
 * 所有模块的乐高积木基础块！
 */
export abstract class BaseModule implements IModule {
  protected state: ModuleState = ModuleState.UNINITIALIZED
  protected logger!: Logger
  protected metadata: ModuleMetadata
  protected services: Map<string, unknown> = new Map()
  protected dependencies: Map<string, IModule> = new Map()

  constructor(metadata: ModuleMetadata) {
    this.metadata = metadata
  }

  /**
   * 初始化模块
   */
  async initialize(deps: Map<string, IModule>, logger: Logger): Promise<void> {
    this.logger = logger
    this.dependencies = deps
    this.state = ModuleState.INITIALIZING

    this.logger.trace(
      'Initializing module',
      { id: this.metadata.id },
      30,
      'initialize',
    )

    await this.onInitialize(deps, logger)
    this.state = ModuleState.READY
  }

  /**
   * 模块初始化钩子
   * 子类可以重写此方法
   */
  protected async onInitialize(
    deps: Map<string, IModule>,
    logger: Logger,
  ): Promise<void> {
    // 默认实现什么都不做
  }

  /**
   * 启动模块
   */
  async start(): Promise<void> {
    this.assertState(ModuleState.READY, 'start')

    this.logger.trace('Starting module', { id: this.metadata.id }, 56, 'start')

    await this.onStart()
  }

  /**
   * 模块启动钩子
   * 子类可以重写此方法
   */
  protected async onStart(): Promise<void> {
    // 默认实现什么都不做
  }

  /**
   * 停止模块
   */
  async stop(): Promise<void> {
    this.state = ModuleState.SHUTTING_DOWN

    this.logger.trace('Stopping module', { id: this.metadata.id }, 78, 'stop')

    await this.onStop()
    this.state = ModuleState.SHUTDOWN
  }

  /**
   * 模块停止钩子
   * 子类可以重写此方法
   */
  protected async onStop(): Promise<void> {
    // 默认实现什么都不做
  }

  /**
   * 获取模块元数据
   */
  getMetadata(): ModuleMetadata {
    return this.metadata
  }

  /**
   * 获取模块状态
   */
  getState(): ModuleState {
    return this.state
  }

  /**
   * 获取服务
   */
  getService<T>(serviceName: string): T | null {
    return (this.services.get(serviceName) as T) || null
  }

  /**
   * 注册服务
   * @protected
   */
  protected registerService(serviceName: string, service: unknown): void {
    this.logger.trace(
      'Registering service',
      { moduleId: this.metadata.id, serviceName },
      119,
      'registerService',
    )
    this.services.set(serviceName, service)
  }

  /**
   * 获取依赖的模块
   * @protected
   */
  protected getDependency<T extends IModule>(moduleId: string): T | null {
    return (this.dependencies.get(moduleId) as T) || null
  }

  /**
   * 断言模块状态
   * @private
   */
  private assertState(expected: ModuleState, operation: string): void {
    if (this.state !== expected) {
      throw new AppError(
        `Cannot ${operation} module ${this.metadata.id}: expected state ${expected}, got ${this.state}`,
        ErrorCode.INVALID_STATE_TRANSITION,
        { moduleId: this.metadata.id, expected, actual: this.state, operation },
      )
    }
  }
}
