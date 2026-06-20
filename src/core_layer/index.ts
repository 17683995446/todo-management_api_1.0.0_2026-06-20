/**
 * Core Layer 公共 API（Barrel File）
 *
 * 统一导出 core_layer 的核心基础设施。
 * 外部消费者应从此文件导入，而非直接引用内部文件路径。
 */

// ── 错误体系 ──
export {
  ErrorCode,
  AppError,
  NotFoundError,
  AlreadyExistsError,
  ValidationError,
  StateTransitionError,
  PolicyViolationError,
  BudgetExceededError,
  UnsupportedOperationError,
  ConfigError,
} from './model/errors.js'

// ── 日志 ──
export { LogLevel, ConsoleLogger } from './logic/logger.js'
export type { LogEntry, Logger } from './logic/logger.js'

// ── 配置 ──
export type { AppConfig } from './data/model/app_config.js'
export { validate_config } from './data/parse/config_validator.js'
export { get_env_var, get_env } from './data/parse/env_loader.js'

// ── 数据访问 ──
export type { BaseEntity } from './data/access/base_repository.js'
export type {
  IRepository,
  IPaginatedRepository,
} from './data/access/repository.interface.js'
export { BaseRepository } from './data/access/base_repository.js'
export { InMemoryRepository } from './data/access/in_memory_repository.js'
export { SqliteRepository } from './data/access/sqlite_repository.js'
export type { SqliteEntityConfig } from './data/access/sqlite_repository.js'
export { MigrationManager } from './data/access/migration_manager.js'

// ── 缓存 ──
export type { ICache, ICacheWithStats } from './logic/cache.interface.js'
export { InMemoryCache } from './logic/in_memory_cache.js'

// ── 模块系统 ──
export { ModuleState } from './module/module.interface.js'
export type {
  ModuleMetadata,
  IModule,
  IConfigurableModule,
  IModuleFactory,
} from './module/module.interface.js'
export { BaseModule } from './module/base_module.js'
export { ModuleRegistry, ModuleManager } from './module/module_registry.js'
export { ModuleLoader } from './module/module_loader.js'

// ── 模型 ──
export type { Todo, TodoPriority } from './model/todo.js'
export {
  PRIORITY_ORDER,
  priorityWeight,
  todoSqliteConfig,
} from './model/todo.js'
export type { User } from './model/user.js'
export { userSqliteConfig } from './model/user.js'

// ── 服务基础设施 ──
export { CircuitBreakerState } from './logic/base_service.js'
export type { CircuitBreakerConfig } from './logic/base_service.js'
export { ShutdownManager } from './logic/shutdown_manager.js'
export { SlidingWindowRateLimiter } from './logic/rate_limiter.js'
export { BasicInputSanitizer } from './logic/input_sanitizer.js'
export { AuthService } from './logic/auth_service.js'
export {
  seedDemoData,
  DEMO_USERNAME,
  DEMO_PASSWORD,
} from './logic/demo_seeder.js'

// ── 遥测 ──
export { TelemetryManager } from './telemetry/telemetry_context.js'
export type { TraceContext } from './telemetry/telemetry_context.js'
export {
  generateTraceId,
  generateSpanId,
  generateTraceContext,
  getCurrentTraceContext,
  runWithTraceContext,
} from './telemetry/telemetry_context.js'
