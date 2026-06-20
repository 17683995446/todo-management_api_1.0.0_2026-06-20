import { BaseModule } from '../core_layer/module/base_module.js'
import type { IModule, IModuleFactory } from '../core_layer/module/module.interface.js'
import type { Logger } from '../core_layer/logic/logger.js'
import type {
  BaseRepository,
  BaseEntity,
} from '../core_layer/data/access/base_repository.js'
import { InMemoryRepository } from '../core_layer/data/access/in_memory_repository.js'

// 示例实体
interface ExampleEntity extends BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
  name: string
}

/**
 * 仓储模块
 * 像内存芯片，管理数据存储！
 */
export class RepositoryModule extends BaseModule {
  private exampleRepository!: BaseRepository<ExampleEntity>

  constructor() {
    super({
      id: 'repository',
      name: 'Repository Module',
      version: '1.0.0',
      description: 'Manages data repositories',
      dependencies: ['config'],
      tags: ['core', 'data'],
    })
  }

  protected async onInitialize(): Promise<void> {
    this.logger.trace(
      'Initializing repositories',
      {},
      34,
      'onInitialize',
    )

    // 创建内存仓储示例
    this.exampleRepository = new InMemoryRepository<ExampleEntity>(
      this.logger,
    )

    // 注册服务
    this.registerService('exampleRepository', this.exampleRepository)
  }

  getExampleRepository(): BaseRepository<ExampleEntity> {
    return this.exampleRepository
  }
}

/**
 * 仓储模块工厂
 */
export class RepositoryModuleFactory implements IModuleFactory {
  getFactoryMetadata() {
    return {
      id: 'repository',
      name: 'Repository Module Factory',
      version: '1.0.0',
      description: 'Factory for creating RepositoryModule',
      tags: ['factory', 'data'],
    }
  }

  createModule(logger: Logger): IModule {
    return new RepositoryModule()
  }
}
