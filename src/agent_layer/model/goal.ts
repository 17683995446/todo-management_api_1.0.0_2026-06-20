/**
 * Agent 目标实体
 * 表示自驱 Agent 希望达成的一个目标。
 *
 * 目标来源：
 * - self_generated: Agent 通过反思自动生成
 * - user: 用户显式下达
 * - schedule: 定时调度产生
 * - reflection: 反思模块基于上次执行结果生成
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'

export type GoalType =
  | 'maintenance'
  | 'optimization'
  | 'monitoring'
  | 'self_improvement'
  | 'user_defined'
export type GoalStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type GoalSource = 'self_generated' | 'user' | 'schedule' | 'reflection'
export type GoalPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Goal extends BaseEntity {
  /** 目标类型 */
  type: GoalType
  /** 人类可读的目标描述 */
  description: string
  /** 优先级 */
  priority: GoalPriority
  /** 当前状态 */
  status: GoalStatus
  /** 目标来源 */
  source: GoalSource
  /** 触发条件（可选），描述何时应激活此目标 */
  triggerCondition?: string
  /** 最大尝试次数 */
  maxAttempts: number
  /** 已尝试次数 */
  attempts: number
  /** 完成时间（可选） */
  completedAt?: string
  /** 上次执行结果摘要 */
  lastResult?: string
}

/**
 * 创建目标的输入参数
 */
export interface CreateGoalInput {
  type: GoalType
  description: string
  priority?: GoalPriority
  source?: GoalSource
  triggerCondition?: string
  maxAttempts?: number
}
