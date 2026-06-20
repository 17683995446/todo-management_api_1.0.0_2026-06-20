/**
 * 资源预算实体
 *
 * 资源预算定义 Agent 在特定周期内可使用的资源上限。
 * 预算耗尽时 Agent 必须停止或降级，防止失控。
 *
 * 设计原则：
 * - 预算按周期刷新（每分钟/每小时/每天）
 * - 预算覆盖多维度：行动次数、执行时间、内存、子 Agent 调用
 * - 预算有软限制（warn）和硬限制（hard stop）
 * - 预算使用情况可查询，支持动态调整
 * - 预算超限时触发策略拒绝
 *
 * 这是秩序化的资源约束：自主性不等于无限制。
 */

/** 预算周期 */
export type BudgetPeriod =
  | 'per_cycle' // 每循环
  | 'per_minute' // 每分钟
  | 'per_hour' // 每小时
  | 'per_day' // 每天

/** 预算维度 */
export type BudgetDimension =
  | 'actions' // 行动次数
  | 'duration_ms' // 执行总耗时
  | 'memory_mb' // 内存使用
  | 'subagent_calls' // 子 Agent 调用次数
  | 'skill_executions' // 技能执行次数

/** 预算限制 */
export interface BudgetLimit {
  /** 预算维度 */
  dimension: BudgetDimension
  /** 周期 */
  period: BudgetPeriod
  /** 软限制（达到时告警） */
  softLimit: number
  /** 硬限制（达到时拒绝） */
  hardLimit: number
}

/** 预算使用情况 */
export interface BudgetUsage {
  /** 预算维度 */
  dimension: BudgetDimension
  /** 周期 */
  period: BudgetPeriod
  /** 当前已使用量 */
  used: number
  /** 软限制 */
  softLimit: number
  /** 硬限制 */
  hardLimit: number
  /** 使用率（0-1） */
  utilization: number
  /** 是否超过软限制 */
  overSoftLimit: boolean
  /** 是否超过硬限制 */
  overHardLimit: boolean
}

/** 预算检查结果 */
export interface BudgetCheckResult {
  /** 是否允许继续执行 */
  allowed: boolean
  /** 触发的预算限制列表 */
  violatedLimits: BudgetUsage[]
  /** 告警列表（超过软限制但未超硬限制） */
  warnings: BudgetUsage[]
}

/** 预算配置 */
export interface BudgetConfig {
  /** 预算限制列表 */
  limits: BudgetLimit[]
}

/** 默认预算配置 */
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  limits: [
    { dimension: 'actions', period: 'per_cycle', softLimit: 5, hardLimit: 10 },
    {
      dimension: 'actions',
      period: 'per_minute',
      softLimit: 30,
      hardLimit: 60,
    },
    {
      dimension: 'duration_ms',
      period: 'per_cycle',
      softLimit: 5000,
      hardLimit: 10000,
    },
    {
      dimension: 'duration_ms',
      period: 'per_minute',
      softLimit: 30000,
      hardLimit: 60000,
    },
    {
      dimension: 'subagent_calls',
      period: 'per_cycle',
      softLimit: 3,
      hardLimit: 5,
    },
    {
      dimension: 'skill_executions',
      period: 'per_cycle',
      softLimit: 3,
      hardLimit: 5,
    },
  ],
}
