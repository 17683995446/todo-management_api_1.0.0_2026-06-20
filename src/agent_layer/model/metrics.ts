/**
 * 指标实体
 *
 * 结构化指标用于可观测性。Agent 运行时持续采集指标，
 * 支持实时监控、趋势分析和异常检测。
 *
 * 设计原则：
 * - 指标按类型分类（计数器、计量器、直方图）
 * - 指标可按时间窗口聚合
 * - 指标支持标签（labels）用于多维度筛选
 * - 指标采集不影响主流程性能（异步、非阻塞）
 * - 指标可导出用于外部监控系统
 *
 * 这是秩序化的可观测性：Agent 行为可度量、可分析。
 */

/** 指标类型 */
export type MetricType =
  | 'counter' // 计数器（只增不减，如总循环数）
  | 'gauge' // 计量器（可增可减，如当前内存）
  | 'histogram' // 直方图（分布，如响应时间）
  | 'timer' // 计时器（耗时，如循环耗时）

/** 指标值 */
export interface MetricValue {
  /** 指标名称 */
  name: string
  /** 当前值 */
  value: number
  /** 标签 */
  labels: Record<string, string>
  /** 采集时间戳 */
  timestamp: string
}

/** 直方图统计 */
export interface HistogramStats {
  count: number
  sum: number
  min: number
  max: number
  mean: number
  p50: number
  p95: number
  p99: number
}

/** 指标定义 */
export interface MetricDefinition {
  /** 指标名称 */
  name: string
  /** 指标类型 */
  type: MetricType
  /** 描述 */
  description: string
  /** 单位 */
  unit?: string
}

/** 指标快照（用于导出） */
export interface MetricSnapshot {
  /** 采集时间 */
  collectedAt: string
  /** 所有计数器指标 */
  counters: Record<string, number>
  /** 所有计量器指标 */
  gauges: Record<string, number>
  /** 所有直方图统计 */
  histograms: Record<string, HistogramStats>
  /** 所有计时器统计 */
  timers: Record<string, HistogramStats>
}

/** 预定义指标名称 */
export const METRIC_NAMES = {
  CYCLES_TOTAL: 'agent.cycles.total',
  CYCLES_DURATION_MS: 'agent.cycles.duration_ms',
  CYCLES_EFFECTIVE: 'agent.cycles.effective',
  ACTIONS_TOTAL: 'agent.actions.total',
  ACTIONS_SUCCESS: 'agent.actions.success',
  ACTIONS_FAILURE: 'agent.actions.failure',
  GOALS_COMPLETED: 'agent.goals.completed',
  GOALS_FAILED: 'agent.goals.failed',
  GOALS_PENDING: 'agent.goals.pending',
  SKILLS_EXECUTED: 'agent.skills.executed',
  SUBAGENT_CALLS: 'agent.subagent.calls',
  POLICY_VIOLATIONS: 'agent.policy.violations',
  BUDGET_UTILIZATION: 'agent.budget.utilization',
  MEMORY_USAGE_MB: 'agent.memory.usage_mb',
  UPTIME_SECONDS: 'agent.uptime.seconds',
} as const

/** 预定义指标定义 */
export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { name: METRIC_NAMES.CYCLES_TOTAL, type: 'counter', description: '总循环数' },
  {
    name: METRIC_NAMES.CYCLES_DURATION_MS,
    type: 'histogram',
    description: '循环耗时分布',
    unit: 'ms',
  },
  {
    name: METRIC_NAMES.CYCLES_EFFECTIVE,
    type: 'counter',
    description: '有效循环数（非 noop）',
  },
  {
    name: METRIC_NAMES.ACTIONS_TOTAL,
    type: 'counter',
    description: '总行动数',
  },
  {
    name: METRIC_NAMES.ACTIONS_SUCCESS,
    type: 'counter',
    description: '成功行动数',
  },
  {
    name: METRIC_NAMES.ACTIONS_FAILURE,
    type: 'counter',
    description: '失败行动数',
  },
  {
    name: METRIC_NAMES.GOALS_COMPLETED,
    type: 'counter',
    description: '已完成目标数',
  },
  {
    name: METRIC_NAMES.GOALS_FAILED,
    type: 'counter',
    description: '失败目标数',
  },
  {
    name: METRIC_NAMES.GOALS_PENDING,
    type: 'gauge',
    description: '待处理目标数',
  },
  {
    name: METRIC_NAMES.SKILLS_EXECUTED,
    type: 'counter',
    description: '技能执行次数',
  },
  {
    name: METRIC_NAMES.SUBAGENT_CALLS,
    type: 'counter',
    description: '子 Agent 调用次数',
  },
  {
    name: METRIC_NAMES.POLICY_VIOLATIONS,
    type: 'counter',
    description: '策略违规次数',
  },
  {
    name: METRIC_NAMES.BUDGET_UTILIZATION,
    type: 'gauge',
    description: '预算使用率',
    unit: 'ratio',
  },
  {
    name: METRIC_NAMES.MEMORY_USAGE_MB,
    type: 'gauge',
    description: '内存使用量',
    unit: 'MB',
  },
  {
    name: METRIC_NAMES.UPTIME_SECONDS,
    type: 'gauge',
    description: '运行时长',
    unit: 's',
  },
]
