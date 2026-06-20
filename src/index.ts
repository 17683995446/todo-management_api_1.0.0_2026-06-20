/**
 * 应用公共 API（顶层 Barrel File）
 *
 * 统一导出整个应用的公共 API。
 * 外部消费者应从此文件导入，而非直接引用内部层路径。
 *
 * 分层导出：
 * - core_layer: 核心基础设施（错误、日志、仓储、缓存、模块系统）
 * - agent_layer: Agent 自驱循环（OODA、增强、治理）
 * - modules: 可插拔模块（Agent、配置、缓存、IO、仓储）
 */

// ── Core Layer ──
export * from './core_layer/index.js'

// ── Agent Layer ──
export * from './agent_layer/index.js'

// ── Modules ──
export * from './modules/index.js'
