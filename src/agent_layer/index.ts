/**
 * Agent Layer 公共 API（Barrel File）
 *
 * 统一导出 agent_layer 所有公共组件、接口和工具函数。
 * 外部消费者应从此文件导入，而非直接引用内部文件路径。
 *
 * 导出组织：
 * - 接口契约（types）
 * - 核心 OODA 组件（core/）
 * - 增强组件（enhancement/）
 * - 治理组件（governance/）
 * - 工具函数与常量
 */

// ── 接口契约 ──
export type {
  IGoalQueue,
  IObserver,
  IDecisionEngine,
  IActor,
  IReflector,
  IAgentMemory,
  AgentMemoryStats,
  IAgentScheduler,
  IAgentLoop,
  CycleResult,
  ISkillRegistry,
  IAgentOrchestrator,
  ITaskPlanner,
  ILearningEngine,
  IWatchdog,
  WatchdogHealth,
  WatchdogStats,
  IPolicyEngine,
  IAuditTrail,
  IResourceBudget,
  ILifecycleManager,
  IMetricsCollector,
} from './agent.interface.js'

// ── 核心 OODA 组件 ──
export { AgentLoop } from './core/agent_loop.js'
export { SystemObserver } from './core/observer.js'
export { RuleBasedDecisionEngine } from './core/decision_engine.js'
export { AgentActor } from './core/actor.js'
export { AgentReflector } from './core/reflector.js'
export { SqliteGoalQueue } from './core/goal_queue.js'
export { TimerAgentScheduler } from './core/scheduler.js'
export type { SchedulerConfig } from './core/scheduler.js'
export { DEFAULT_SCHEDULER_CONFIG } from './core/scheduler.js'

// ── 增强组件 ──
export { EnhancedAgentLoop } from './enhancement/enhanced_agent_loop.js'
export { SkillRegistry } from './enhancement/skill_registry.js'
export { AgentOrchestrator } from './enhancement/orchestrator.js'
export { TaskPlanner } from './enhancement/task_planner.js'
export { LearningEngine } from './enhancement/learning_engine.js'
export { Watchdog } from './enhancement/watchdog.js'
export type { WatchdogConfig } from './enhancement/watchdog.js'
export { DEFAULT_WATCHDOG_CONFIG } from './enhancement/watchdog.js'
export {
  createDataCleanupSkill,
  createHealthCheckSkill,
  createCacheOptimizeSkill,
  createReportSkill,
  createTrendAnalysisSkill,
  registerBuiltinSkills,
} from './enhancement/builtin_skills.js'

// ── 治理组件 ──
export { OrderedAgentLoop } from './governance/ordered_agent_loop.js'
export {
  PolicyEngine,
  DEFAULT_POLICIES,
  registerDefaultPolicies,
} from './governance/policy_engine.js'
export { AuditTrail } from './governance/audit_trail.js'
export { ResourceBudget } from './governance/resource_budget.js'
export { LifecycleManager } from './governance/lifecycle_manager.js'
export { MetricsCollector } from './governance/metrics_collector.js'

// ── 模块配置 ──
export type { AgentModuleConfig } from './agent_module_config.js'
export { DEFAULT_AGENT_MODULE_CONFIG } from './agent_module_config.js'
