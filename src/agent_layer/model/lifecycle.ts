/**
 * 生命周期状态模型
 *
 * 定义 Agent 的正式生命周期状态机。状态转换受严格约束，
 * 非法转换被拒绝，确保 Agent 行为可预测。
 *
 * 设计原则：
 * - 状态机有明确的合法转换路径
 * - 每个状态有允许的操作集合
 * - 状态转换记录到审计日志
 * - 异常状态（failed）需要显式恢复
 * - 支持优雅停止（draining）和强制停止（stopped）
 *
 * 这是秩序化的行为契约：Agent 状态可预测、可管理。
 */

/** 生命周期状态 */
export type LifecycleState =
  | 'initializing' // 初始化中
  | 'ready' // 就绪，可启动
  | 'running' // 运行中
  | 'paused' // 暂停（可恢复）
  | 'draining' // 排空中（完成当前循环后停止）
  | 'recovering' // 恢复中（故障后自动恢复）
  | 'failed' // 失败（需人工或看门狗介入）
  | 'stopped' // 已停止

/** 生命周期事件类型 */
export type LifecycleEventType =
  | 'initialize' // 初始化
  | 'ready' // 就绪
  | 'start' // 启动
  | 'pause' // 暂停
  | 'resume' // 恢复
  | 'drain' // 开始排空
  | 'recover' // 恢复（从 failed）
  | 'fail' // 失败
  | 'stop' // 停止

/** 合法的状态转换映射 */
export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  initializing: ['ready', 'failed'],
  ready: ['running', 'stopped'],
  running: ['paused', 'draining', 'failed', 'stopped'],
  paused: ['running', 'stopped'],
  draining: ['stopped'],
  recovering: ['running', 'failed'],
  failed: ['recovering', 'stopped'],
  stopped: ['initializing'],
}

/** 状态转换记录 */
export interface StateTransition {
  /** 转换前状态 */
  from: LifecycleState
  /** 转换后状态 */
  to: LifecycleState
  /** 触发事件 */
  event: LifecycleEventType
  /** 转换时间戳 */
  timestamp: string
  /** 转换原因 */
  reason?: string
}

/** 生命周期快照 */
export interface LifecycleSnapshot {
  /** 当前状态 */
  currentState: LifecycleState
  /** 之前状态 */
  previousState?: LifecycleState
  /** 进入当前状态的时间 */
  enteredAt: string
  /** 状态转换历史 */
  transitionHistory: StateTransition[]
  /** 总运行时长（毫秒） */
  totalUptimeMs: number
  /** 总暂停时长（毫秒） */
  totalPausedMs: number
  /** 循环执行次数 */
  cycleCount: number
}

/** 检查状态转换是否合法 */
export function isValidTransition(
  from: LifecycleState,
  to: LifecycleState,
): boolean {
  const allowed = VALID_TRANSITIONS[from]
  return allowed.includes(to)
}
