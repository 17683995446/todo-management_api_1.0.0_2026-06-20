import type { Logger } from '../logic/logger.js'

/**
 * 模块生命周期状态
 */
export enum ModuleState {
  /** 未初始化 */
  UNINITIALIZED = 'uninitialized',
  /** 正在初始化 */
  INITIALIZING = 'initializing',
  /** 已就绪 */
  READY = 'ready',
  /** 正在关闭 */
  SHUTTING_DOWN = 'shutting_down',
  /** 已关闭 */
  SHUTDOWN = 'shutdown',
  /** 错误状态 */
  ERROR = 'error',
}

/**
 * 模块元数据
 */
export interface ModuleMetadata {
  /** 模块唯一标识符（像元器件型号） */
  readonly id: string
  /** 模块名称 */
  readonly name: string
  /** 模块版本 */
  readonly version: string
  /** 模块描述 */
  readonly description?: string
  /** 依赖的其他模块 ID */
  readonly dependencies?: string[]
  /** 模块类型标签 */
  readonly tags?: string[]
}

/**
 * 基础模块接口 - 所有可插拔模块的契约
 * 像电子元器件的标准引脚定义！
 */
export interface IModule {
  /** 获取模块元数据 */
  getMetadata(): ModuleMetadata

  /** 获取模块当前状态 */
  getState(): ModuleState

  /**
   * 初始化模块
   * @param deps 依赖的模块实例
   * @param logger 日志记录器
   */
  initialize(deps: Map<string, IModule>, logger: Logger): Promise<void>

  /**
   * 启动模块
   */
  start(): Promise<void>

  /**
   * 停止模块
   */
  stop(): Promise<void>

  /**
   * 获取模块提供的服务
   */
  getService<T>(serviceName: string): T | null
}

/**
 * 可配置模块接口
 */
export interface IConfigurableModule<TConfig = unknown> extends IModule {
  /**
   * 配置模块
   * @param config 配置对象
   */
  configure(config: TConfig): void
}

/**
 * 模块工厂接口 - 用于创建模块实例
 */
export interface IModuleFactory {
  /**
   * 创建模块实例
   */
  createModule(logger: Logger): IModule

  /**
   * 获取工厂元数据
   */
  getFactoryMetadata(): ModuleMetadata
}
