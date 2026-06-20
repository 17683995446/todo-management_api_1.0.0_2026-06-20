/**
 * 策略实体
 *
 * 策略是约束 Agent 行为的声明式规则。Agent 在执行任何行动前，
 * 必须先通过策略引擎检查，确保行为在允许范围内。
 *
 * 设计原则：
 * - 策略是声明式的，描述"什么被允许/禁止"，而非"如何执行"
 * - 策略有类型（限制、配额、禁用、必需）
 * - 策略有优先级，高优先级策略先评估
 * - 策略可启用/禁用，支持运行时调整
 * - 策略评估返回明确结果（允许/拒绝/需调整）
 *
 * 这是秩序化的第一道防线：给自主性加上安全边界。
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'

/** 策略类型 */
export type PolicyType =
  | 'limit' // 限制类（如"每分钟最多 10 次行动"）
  | 'quota' // 配额类（如"每天最多 100 次创建"）
  | 'forbidden' // 禁用类（如"禁止删除用户数据"）
  | 'required' // 必需类（如"执行前必须先自检"）
  | 'schedule' // 调度类（如"仅在工作时间运行"）

/** 策略评估结果 */
export type PolicyDecision =
  | 'allow' // 允许执行
  | 'deny' // 拒绝执行
  | 'adjust' // 需调整参数后执行

/** 策略作用范围 */
export type PolicyScope =
  | 'action' // 作用于具体行动
  | 'resource' // 作用于资源使用
  | 'schedule' // 作用于时间调度
  | 'global' // 全局策略

/** 策略实体（可持久化） */
export interface Policy extends BaseEntity {
  /** 策略名称（唯一标识） */
  name: string
  /** 人类可读描述 */
  description: string
  /** 策略类型 */
  type: PolicyType
  /** 作用范围 */
  scope: PolicyScope
  /** 优先级（数字越大优先级越高） */
  priority: number
  /** 是否启用 */
  enabled: boolean
  /** 策略规则（序列化的条件表达式描述） */
  rule: string
  /** 拒绝时的原因模板 */
  denialReason?: string
}

/** 策略评估上下文 */
export interface PolicyContext {
  /** 待评估的行动类型 */
  actionType: string
  /** 行动参数 */
  actionParams: Record<string, unknown>
  /** 当前目标 ID */
  goalId?: string
  /** 当前时间戳 */
  timestamp: string
  /** 资源使用快照（用于配额检查） */
  resourceUsage?: ResourceUsageSnapshot
}

/** 资源使用快照（用于策略评估） */
export interface ResourceUsageSnapshot {
  /** 当前周期内已执行的行动数 */
  actionsThisCycle: number
  /** 当前周期内的累计耗时（毫秒） */
  durationThisCycleMs: number
  /** 内存使用量（MB） */
  memoryUsageMb: number
}

/** 策略评估结果 */
export interface PolicyEvaluationResult {
  /** 决策 */
  decision: PolicyDecision
  /** 触发的策略名称列表 */
  triggeredPolicies: string[]
  /** 拒绝/调整原因 */
  reason?: string
  /** 调整后的参数（当 decision 为 adjust 时） */
  adjustedParams?: Record<string, unknown>
}

/** 创建策略的输入 */
export interface CreatePolicyInput {
  name: string
  description: string
  type: PolicyType
  scope: PolicyScope
  priority?: number
  rule: string
  denialReason?: string
}
