import type { AppConfig } from '../core_layer/data/model/app_config.js'
import { parse_config } from '../core_layer/data/parse/config_parser.js'
import { BaseModule } from '../core_layer/module/base_module.js'
import type { IModule, IModuleFactory } from '../core_layer/module/module.interface.js'
import type { Logger } from '../core_layer/logic/logger.js'

/**
 * 配置模块
 * 像一个电源管理芯片！
 */
export class ConfigModule extends BaseModule {
  private config!: AppConfig

  constructor() {
    super({
      id: 'config',
      name: 'Configuration Module',
      version: '1.0.0',
      description: 'Manages application configuration',
      tags: ['core', 'config'],
    })
  }

  protected async onInitialize(): Promise<void> {
    this.logger.trace('Loading configuration', {}, 26, 'onInitialize')
    this.config = await parse_config('development', this.logger)
    this.registerService('appConfig', this.config)
  }

  getConfig(): AppConfig {
    return this.config
  }
}

/**
 * 配置模块工厂
 */
export class ConfigModuleFactory implements IModuleFactory {
  getFactoryMetadata() {
    return {
      id: 'config',
      name: 'Configuration Module Factory',
      version: '1.0.0',
      description: 'Factory for creating ConfigModule',
      tags: ['factory', 'core'],
    }
  }

  createModule(logger: Logger): IModule {
    return new ConfigModule()
  }
}
