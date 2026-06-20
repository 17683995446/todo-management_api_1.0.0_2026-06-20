/**
 * Agent 模块配置
 *
 * 定义 AgentModule 初始化所需的配置参数。
 * 采用结构化子配置模式，每个可配置组件拥有独立的 config 接口。
 */
import type { SchedulerConfig } from './core/scheduler.js'
import type { WatchdogConfig } from './enhancement/watchdog.js'
import type { BudgetConfig } from './model/budget.js'
import { DEFAULT_SCHEDULER_CONFIG } from './core/scheduler.js'
import { DEFAULT_WATCHDOG_CONFIG } from './enhancement/watchdog.js'
import { DEFAULT_BUDGET_CONFIG } from './model/budget.js'

export interface AgentModuleConfig {
  /** SQLite 数据库文件路径 */
  dbPath: string
  /** 调度器配置 */
  scheduler: SchedulerConfig
  /** 看门狗配置 */
  watchdog: WatchdogConfig
  /** 资源预算配置 */
  budget: BudgetConfig
  /** 是否启用治理组件（策略/审计/预算/生命周期/指标） */
  enableGovernance: boolean
  /** 是否启用增强组件（技能/编排/任务/学习/看门狗） */
  enableEnhancement: boolean
}

/**
 * 默认 Agent 模块配置
 */
export const DEFAULT_AGENT_MODULE_CONFIG: AgentModuleConfig = {
  dbPath: ':memory:',
  scheduler: DEFAULT_SCHEDULER_CONFIG,
  watchdog: DEFAULT_WATCHDOG_CONFIG,
  budget: DEFAULT_BUDGET_CONFIG,
  enableGovernance: true,
  enableEnhancement: true,
}
