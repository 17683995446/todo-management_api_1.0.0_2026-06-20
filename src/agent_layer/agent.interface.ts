import type { ActionResult } from './model/action_result.js'
import type {
  AgentInfo,
  RegisterAgentInput,
  SubAgentResult,
} from './model/agent_info.js'
import type {
  AuditEvent,
  AuditQuery,
  AuditStats,
  CreateAuditEventInput,
} from './model/audit.js'
import type {
  BudgetCheckResult,
  BudgetConfig,
  BudgetLimit,
  BudgetUsage,
} from './model/budget.js'
import type { Decision } from './model/decision.js'
/**
 * Agent 层核心接口定义
 * 定义自驱 Agent 各组件的契约。
 *
 * 增强版接口支持四大能力：
 * 1. 技能系统（ISkillRegistry）— 可插拔能力扩展
 * 2. 多 Agent 编排（IAgentOrchestrator）— 子 Agent 协作
 * 3. 长任务规划（ITaskPlanner）— 里程碑分解与检查点
 * 4. 学习引擎（ILearningEngine）— 模式提取与规则进化
 * 5. 永续运行（IWatchdog）— 健康监控与自动恢复
 *
 * 治理版接口（秩序化）支持五大纪律：
 * 6. 策略引擎（IPolicyEngine）— 行为约束
 * 7. 审计日志（IAuditTrail）— 全程可追溯
 * 8. 资源预算（IResourceBudget）— 资源约束
 * 9. 生命周期（ILifecycleManager）— 状态机管理
 * 10. 指标采集（IMetricsCollector）— 可观测性
 */
import type { CreateGoalInput, Goal } from './model/goal.js'
import type {
  CreateLearningInput,
  Learning,
  LearningStats,
} from './model/learning.js'
import type {
  LifecycleEventType,
  LifecycleSnapshot,
  LifecycleState,
  StateTransition,
} from './model/lifecycle.js'
import type {
  HistogramStats,
  MetricDefinition,
  MetricSnapshot,
  MetricValue,
} from './model/metrics.js'
import type { Observation } from './model/observation.js'
import type {
  CreatePolicyInput,
  Policy,
  PolicyContext,
  PolicyEvaluationResult,
} from './model/policy.js'
import type { Reflection } from './model/reflection.js'
import type {
  RegisterSkillInput,
  Skill,
  SkillContext,
  SkillResult,
} from './model/skill.js'
import type {
  CreateTaskInput,
  Milestone,
  Task,
  TaskProgress,
} from './model/task.js'

/**
 * 目标队列接口
 * 负责 Agent 目标的持久化存储和检索。
 */
export interface IGoalQueue {
  /** 添加目标 */
  add(input: CreateGoalInput): Promise<Goal>
  /** 获取下一个待执行的目标（按优先级排序） */
  next(): Promise<Goal | null>
  /** 更新目标状态 */
  update(id: string, updates: Partial<Goal>): Promise<Goal>
  /** 标记目标为进行中 */
  markInProgress(id: string): Promise<Goal>
  /** 标记目标为已完成 */
  markCompleted(id: string, result?: string): Promise<Goal>
  /** 标记目标为失败 */
  markFailed(id: string, error: string): Promise<Goal>
  /** 获取所有目标 */
  findAll(): Promise<Goal[]>
  /** 获取待执行目标数量 */
  pendingCount(): Promise<number>
}

/**
 * 观察者接口
 * 负责收集系统当前状态，形成观察快照。
 */
export interface IObserver {
  /** 执行一次观察，返回当前系统状态快照 */
  observe(): Promise<Observation>
}

/**
 * 决策引擎接口
 * 基于观察结果和当前目标队列，决定下一步行动。
 */
export interface IDecisionEngine {
  /** 根据观察和目标做出决策 */
  decide(observation: Observation, currentGoal?: Goal | null): Promise<Decision>
}

/**
 * 执行器接口
 * 负责安全执行决策指定的行动。
 */
export interface IActor {
  /** 执行决策 */
  act(decision: Decision): Promise<ActionResult>
}

/**
 * 反思器接口
 * 评估行动结果，提取经验，生成新目标。
 */
export interface IReflector {
  /** 反思行动结果 */
  reflect(
    actionResult: ActionResult,
    decision: Decision,
    observation: Observation,
  ): Promise<Reflection>
}

/**
 * Agent 记忆接口
 * 存储观察、决策、行动结果、反思的历史记录。
 */
export interface IAgentMemory {
  /** 保存观察记录 */
  saveObservation(observation: Observation): Promise<void>
  /** 保存决策记录 */
  saveDecision(decision: Decision): Promise<void>
  /** 保存行动结果 */
  saveActionResult(result: ActionResult): Promise<void>
  /** 保存反思记录 */
  saveReflection(reflection: Reflection): Promise<void>
  /** 获取最近的 N 条观察 */
  recentObservations(limit: number): Promise<Observation[]>
  /** 获取最近的 N 条行动结果 */
  recentActionResults(limit: number): Promise<ActionResult[]>
  /** 获取最近的 N 条反思 */
  recentReflections(limit: number): Promise<Reflection[]>
  /** 获取统计信息 */
  stats(): Promise<AgentMemoryStats>
}

export interface AgentMemoryStats {
  totalObservations: number
  totalDecisions: number
  totalActions: number
  totalReflections: number
  successRate: number
  lastCycleAt?: string
}

/**
 * 调度器接口
 * 负责按时间或事件触发 Agent 循环。
 */
export interface IAgentScheduler {
  /** 启动调度 */
  start(): void
  /** 停止调度 */
  stop(): void
  /** 是否正在运行 */
  isRunning(): boolean
  /** 注册触发回调 */
  onTrigger(callback: () => Promise<void>): void
}

/**
 * Agent 循环接口
 * 编排完整的 OODA 循环：观察 → 决策 → 行动 → 反思。
 */
export interface IAgentLoop {
  /** 执行一次完整的 OODA 循环 */
  runCycle(): Promise<CycleResult>
  /** 启动自动循环 */
  start(): void
  /** 停止自动循环 */
  stop(): void
  /** 是否正在运行 */
  isRunning(): boolean
}

export interface CycleResult {
  observation: Observation
  decision: Decision
  actionResult: ActionResult
  reflection: Reflection
  /** 本次循环是否产生了有效行动（非 noop） */
  effective: boolean
  /** 循环耗时（毫秒） */
  durationMs: number
}

// ═══════════════════════════════════════════════════════════════════
// 增强版接口：技能系统、多 Agent 编排、长任务规划、学习引擎、永续运行
// ═══════════════════════════════════════════════════════════════════

/**
 * 技能注册表接口
 * 管理可插拔技能的注册、查询和执行。
 * Agent 通过技能系统扩展自身能力，实现"自主学会增强自己的技能"。
 */
export interface ISkillRegistry {
  /** 注册新技能 */
  register(input: RegisterSkillInput): Promise<Skill>
  /** 注销技能 */
  unregister(name: string): Promise<boolean>
  /** 启用/禁用技能 */
  setEnabled(name: string, enabled: boolean): Promise<Skill>
  /** 按名称获取技能 */
  get(name: string): Skill | null
  /** 获取所有已注册技能 */
  list(): Skill[]
  /** 查找能处理给定上下文的技能 */
  findCapable(context: SkillContext): Skill[]
  /** 执行技能 */
  execute(name: string, context: SkillContext): Promise<SkillResult>
  /** 更新技能使用统计 */
  recordUsage(name: string, result: SkillResult): Promise<void>
}

/**
 * 多 Agent 编排器接口
 * 管理子 Agent 的注册、任务分配和结果聚合。
 * Agent 通过编排器操作多个子 Agent 完成任务。
 */
export interface IAgentOrchestrator {
  /** 注册子 Agent */
  registerAgent(input: RegisterAgentInput): Promise<AgentInfo>
  /** 注销子 Agent */
  unregisterAgent(id: string): Promise<boolean>
  /** 获取所有子 Agent */
  listAgents(): Promise<AgentInfo[]>
  /** 查找空闲且有能力的子 Agent */
  findAvailable(capability: string): Promise<AgentInfo | null>
  /** 分配任务给子 Agent */
  assignTask(agentId: string, taskId: string): Promise<void>
  /** 子 Agent 执行任务并返回结果 */
  executeTask(
    agentId: string,
    taskId: string,
    params: Record<string, unknown>,
  ): Promise<SubAgentResult>
  /** 更新子 Agent 状态 */
  updateAgentStatus(id: string, status: AgentInfo['status']): Promise<void>
  /** 获取子 Agent 性能统计 */
  getPerformance(id: string): Promise<AgentInfo['performance'] | null>
}

/**
 * 长任务规划器接口
 * 将复杂目标分解为可执行的子任务树，跟踪进度，支持检查点恢复。
 * Agent 通过任务规划器自主驱动完成长任务。
 */
export interface ITaskPlanner {
  /** 为目标创建任务分解计划 */
  plan(goalId: string, description: string): Promise<Task[]>
  /** 添加子任务 */
  addTask(input: CreateTaskInput): Promise<Task>
  /** 获取任务的完整子树 */
  getTaskTree(taskId: string): Promise<Task[]>
  /** 获取目标下的所有任务 */
  getTasksByGoal(goalId: string): Promise<Task[]>
  /** 获取下一个可执行的任务（依赖已完成） */
  nextExecutable(goalId: string): Promise<Task | null>
  /** 更新任务状态 */
  updateTaskStatus(
    taskId: string,
    status: Task['status'],
    result?: string,
  ): Promise<Task>
  /** 保存检查点 */
  saveCheckpoint(taskId: string, checkpoint: string): Promise<void>
  /** 从检查点恢复 */
  restoreCheckpoint(taskId: string): Promise<string | null>
  /** 获取目标进度 */
  getProgress(goalId: string): Promise<TaskProgress>
  /** 添加里程碑 */
  addMilestone(
    taskId: string,
    title: string,
    description: string,
  ): Promise<Milestone>
  /** 完成里程碑 */
  completeMilestone(milestoneId: string): Promise<Milestone>
  /** 获取任务的所有里程碑 */
  getMilestones(taskId: string): Promise<Milestone[]>
}

/**
 * 学习引擎接口
 * 从反思中提取模式，更新决策规则，习得新技能需求。
 * Agent 通过学习引擎实现自我进化。
 */
export interface ILearningEngine {
  /** 记录一次学习 */
  learn(input: CreateLearningInput): Promise<Learning>
  /** 获取所有学习记录 */
  findAll(): Promise<Learning[]>
  /** 获取未应用的学习记录 */
  findUnapplied(): Promise<Learning[]>
  /** 获取学习统计 */
  stats(): Promise<LearningStats>
  /** 标记学习为已应用 */
  markApplied(id: string): Promise<Learning>
  /** 从反思中提取学习 */
  learnFromReflection(
    reflection: Reflection,
    decision: Decision,
  ): Promise<Learning[]>
  /** 获取规则更新建议 */
  getRuleUpdates(): Promise<Learning[]>
}

/**
 * 永续运行看门狗接口
 * 监控 Agent 健康，自动恢复故障，确保持久运行。
 * Agent 通过看门狗实现"永远运行不停止"。
 */
export interface IWatchdog {
  /** 启动看门狗 */
  start(): void
  /** 停止看门狗 */
  stop(): void
  /** 是否正在运行 */
  isRunning(): boolean
  /** 执行一次健康检查 */
  checkHealth(): Promise<WatchdogHealth>
  /** 注册恢复回调（当检测到故障时调用） */
  onRecover(callback: () => Promise<void>): void
  /** 注册健康检查回调 */
  onCheck(callback: () => Promise<boolean>): void
  /** 获取运行统计 */
  getStats(): WatchdogStats
  /** 手动触发恢复 */
  triggerRecovery(): Promise<void>
}

/** 看门狗健康状态 */
export interface WatchdogHealth {
  /** 是否健康 */
  healthy: boolean
  /** 检查时间戳 */
  checkedAt: string
  /** 失败原因 */
  failureReason?: string
  /** 连续失败次数 */
  consecutiveFailures: number
}

/** 看门狗运行统计 */
export interface WatchdogStats {
  /** 总检查次数 */
  totalChecks: number
  /** 健康检查通过次数 */
  healthyChecks: number
  /** 恢复触发次数 */
  recoveryCount: number
  /** 最后检查时间 */
  lastCheckAt?: string
  /** 最后恢复时间 */
  lastRecoveryAt?: string
  /** 连续失败次数 */
  consecutiveFailures: number
}

// ═══════════════════════════════════════════════════════════════════
// 治理版接口（秩序化）：策略、审计、预算、生命周期、指标
// ═══════════════════════════════════════════════════════════════════

/**
 * 策略引擎接口
 * 在 Agent 执行任何行动前评估策略，确保行为在允许范围内。
 * 这是秩序化的第一道防线。
 */
export interface IPolicyEngine {
  /** 注册策略 */
  registerPolicy(input: CreatePolicyInput): Promise<Policy>
  /** 注销策略 */
  unregisterPolicy(name: string): Promise<boolean>
  /** 启用/禁用策略 */
  setEnabled(name: string, enabled: boolean): Promise<Policy>
  /** 获取所有策略 */
  listPolicies(): Policy[]
  /** 评估上下文是否被策略允许 */
  evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>
  /** 获取策略违规统计 */
  getViolationStats(): Promise<Record<string, number>>
}

/**
 * 审计日志接口
 * 不可变地记录 Agent 的所有行为，支持全程可追溯。
 */
export interface IAuditTrail {
  /** 记录审计事件（不可变） */
  record(input: CreateAuditEventInput): Promise<AuditEvent>
  /** 查询审计事件 */
  query(query: AuditQuery): Promise<AuditEvent[]>
  /** 获取审计统计 */
  stats(): Promise<AuditStats>
  /** 获取最近 N 条事件 */
  recent(limit: number): Promise<AuditEvent[]>
  /** 按循环 ID 查询事件 */
  getByCycle(cycleId: number): Promise<AuditEvent[]>
}

/**
 * 资源预算接口
 * 跟踪资源使用，在超限时拒绝执行，防止失控。
 */
export interface IResourceBudget {
  /** 配置预算限制 */
  configure(config: BudgetConfig): void
  /** 记录资源使用 */
  recordUsage(dimension: BudgetLimit['dimension'], amount: number): void
  /** 检查是否允许继续执行 */
  check(): BudgetCheckResult
  /** 获取当前使用情况 */
  getUsage(): BudgetUsage[]
  /** 重置周期计数（由调度器定期调用） */
  resetPeriod(period: BudgetLimit['period']): void
  /** 获取预算配置 */
  getConfig(): BudgetConfig
}

/**
 * 生命周期管理器接口
 * 管理 Agent 的正式状态机，约束状态转换。
 */
export interface ILifecycleManager {
  /** 获取当前状态 */
  getState(): LifecycleState
  /** 获取生命周期快照 */
  getSnapshot(): LifecycleSnapshot
  /** 触发状态转换 */
  transition(event: LifecycleEventType, reason?: string): StateTransition
  /** 检查转换是否合法 */
  canTransition(to: LifecycleState): boolean
  /** 是否处于运行状态 */
  isRunning(): boolean
  /** 是否处于可执行状态（running 或 draining） */
  canExecute(): boolean
  /** 记录循环完成 */
  recordCycle(): void
  /** 获取转换历史 */
  getHistory(): StateTransition[]
}

/**
 * 指标采集器接口
 * 结构化采集 Agent 运行指标，支持可观测性。
 */
export interface IMetricsCollector {
  /** 递增计数器 */
  incrementCounter(
    name: string,
    value?: number,
    labels?: Record<string, string>,
  ): void
  /** 设置计量器值 */
  setGauge(name: string, value: number, labels?: Record<string, string>): void
  /** 记录直方图样本 */
  recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void
  /** 记录计时器样本 */
  recordTimer(
    name: string,
    durationMs: number,
    labels?: Record<string, string>,
  ): void
  /** 获取计数器值 */
  getCounter(name: string): number
  /** 获取计量器值 */
  getGauge(name: string): number
  /** 获取直方图统计 */
  getHistogram(name: string): HistogramStats | null
  /** 获取计时器统计 */
  getTimer(name: string): HistogramStats | null
  /** 导出指标快照 */
  snapshot(): MetricSnapshot
  /** 获取所有已注册指标定义 */
  definitions(): MetricDefinition[]
  /** 重置所有指标 */
  reset(): void
}
