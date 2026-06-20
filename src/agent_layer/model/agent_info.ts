/**
 * 子 Agent 信息实体
 *
 * 子 Agent 是主 Agent 可调度的协作单元。主 Agent 通过编排器
 * 派发任务给子 Agent，实现"自主学会操作多个 Agent 完成任务"。
 *
 * 设计原则：
 * - 子 Agent 信息可持久化，跨重启保持注册状态
 * - 子 Agent 有角色（worker / coordinator / specialist）
 * - 子 Agent 有能力列表（capabilities，对应技能名称）
 * - 子 Agent 有性能统计，用于任务分配优化
 * - 子 Agent 有状态（idle / busy / failed / stopped）
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'

/** 子 Agent 状态 */
export type AgentStatus =
  | 'idle' // 空闲，可接受任务
  | 'busy' // 忙碌，正在执行任务
  | 'failed' // 失败，需要恢复
  | 'stopped' // 已停止

/** 子 Agent 角色 */
export type AgentRole =
  | 'worker' // 工作者，执行具体任务
  | 'coordinator' // 协调者，管理子任务
  | 'specialist' // 专家，处理特定领域任务

/** 子 Agent 性能统计 */
export interface AgentPerformance {
  /** 完成任务数 */
  tasksCompleted: number
  /** 失败任务数 */
  tasksFailed: number
  /** 平均任务耗时（毫秒） */
  avgTaskDurationMs: number
  /** 最后活跃时间 */
  lastActiveAt?: string
}

/** 子 Agent 信息 */
export interface AgentInfo extends BaseEntity {
  /** Agent 名称 */
  name: string
  /** 角色 */
  role: AgentRole
  /** 能力列表（技能名称） */
  capabilities: string[]
  /** 当前状态 */
  status: AgentStatus
  /** 当前执行的任务 ID */
  currentTaskId?: string
  /** 性能统计 */
  performance: AgentPerformance
}

/** 注册子 Agent 的输入 */
export interface RegisterAgentInput {
  name: string
  role: AgentRole
  capabilities: string[]
}

/** 子 Agent 执行结果 */
export interface SubAgentResult {
  /** 子 Agent ID */
  agentId: string
  /** 任务 ID */
  taskId: string
  /** 是否成功 */
  success: boolean
  /** 输出 */
  output: unknown
  /** 错误信息 */
  error?: string
  /** 执行耗时（毫秒） */
  durationMs: number
}
