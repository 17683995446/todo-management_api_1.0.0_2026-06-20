import { BaseModule } from '../core_layer/module/base_module.js'
import type { IModule, IModuleFactory, ModuleMetadata } from '../core_layer/module/module.interface.js'
import type { Logger } from '../core_layer/logic/logger.js'
import { CliInputHandler } from '../presentation_layer/cli/input/cli_input_handler.js'
import { CliOutputRenderer } from '../presentation_layer/cli/output/cli_output_renderer.js'

/**
 * IO模块 - 像输入输出接口一样的模块！
 */
export class IOModule extends BaseModule {
  private inputHandler!: CliInputHandler
  private outputRenderer!: CliOutputRenderer

  constructor() {
    super({
      id: 'io',
      name: 'IO Module',
      version: '1.0.0',
      description: 'Input and output handling module',
      dependencies: ['config'],
      tags: ['io', 'presentation']
    })
  }

  protected async onInitialize(): Promise<void> {
    this.logger.trace('Initializing IO module', {}, 25, 'onInitialize')
    
    // 创建IO处理器
    this.inputHandler = new CliInputHandler(this.logger)
    this.outputRenderer = new CliOutputRenderer(this.logger)
    
    // 注册服务
    this.registerService('inputHandler', this.inputHandler)
    this.registerService('outputRenderer', this.outputRenderer)
    
    this.logger.trace('IO module initialized', {}, 35, 'onInitialize')
  }

  protected async onStart(): Promise<void> {
    this.logger.trace('IO module started', {}, 39, 'onStart')
  }

  protected async onStop(): Promise<void> {
    this.logger.trace('Shutting down IO module...', {}, 43, 'onStop')
    this.inputHandler.close()
    this.logger.trace('IO module stopped', {}, 46, 'onStop')
  }
}

/**
 * IO模块工厂
 */
export class IOModuleFactory implements IModuleFactory {
  getFactoryMetadata(): ModuleMetadata {
    return {
      id: 'io',
      name: 'IO Module Factory',
      version: '1.0.0',
      description: 'Factory for creating IO Module',
      tags: ['factory', 'io']
    }
  }

  createModule(logger: Logger): IModule {
    return new IOModule()
  }
}
