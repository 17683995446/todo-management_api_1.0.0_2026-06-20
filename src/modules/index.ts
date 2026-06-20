/**
 * Modules 公共 API（Barrel File）
 *
 * 统一导出所有可插拔模块。
 * 每个模块整合相关组件，接入 core_layer 的模块系统。
 *
 * 模块列表：
 * - AgentModule: Agent 自驱循环模块（OODA + 治理 + 增强）
 * - ConfigModule: 配置管理模块
 * - CacheModule: 缓存模块
 * - IOModule: 输入输出模块
 * - RepositoryModule: 仓储模块
 */

export { AgentModule, AgentModuleFactory } from './agent_module.js'
export { ConfigModule, ConfigModuleFactory } from './config_module.js'
export { CacheModule, CacheModuleFactory } from './cache_module.js'
export { IOModule, IOModuleFactory } from './io_module.js'
export {
  RepositoryModule,
  RepositoryModuleFactory,
} from './repository_module.js'
