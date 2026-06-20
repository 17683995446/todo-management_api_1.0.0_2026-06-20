/**
 * 审计事件实体
 *
 * 审计事件是不可变的行为记录，记录 Agent 的每一次决策、行动和结果。
 * 审计日志支持全程可追溯，是秩序化的问责基础。
 *
 * 设计原则：
 * - 审计事件一旦创建不可修改（append-only）
 * - 记录完整的因果链（observationId → decisionId → actionResultId → reflectionId）
 * - 包含足够的上下文用于事后分析
 * - 支持按时间、类型、目标查询
 * - 审计与执行分离：行动失败不影响审计记录
 *
 * 这是秩序化的问责机制：所有行为有据可查。
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'

/** 审计事件类型 */
export type AuditEventType =
  | 'cycle_start' // 循环开始
  | 'cycle_end' // 循环结束
  | 'observation' // 观察记录
  | 'decision' // 决策记录
  | 'action_start' // 行动开始
  | 'action_end' // 行动结束
  | 'reflection' // 反思记录
  | 'policy_check' // 策略检查
  | 'policy_violation' // 策略违规
  | 'lifecycle' // 生命周期事件
  | 'recovery' // 恢复事件
  | 'error' // 错误事件

/** 审计事件严重级别 */
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical'

/** 审计事件实体（不可变） */
export interface AuditEvent extends BaseEntity {
  /** 事件类型 */
  eventType: AuditEventType
  /** 严重级别 */
  severity: AuditSeverity
  /** 关联的循环序号 */
  cycleId?: number
  /** 关联的目标 ID */
  goalId?: string
  /** 关联的观察 ID */
  observationId?: string
  /** 关联的决策 ID */
  decisionId?: string
  /** 关联的行动结果 ID */
  actionResultId?: string
  /** 事件消息 */
  message: string
  /** 详细数据（JSON 序列化） */
  details: string
  /** 事件时间戳（ISO 字符串） */
  eventTimestamp: string
}

/** 创建审计事件的输入 */
export interface CreateAuditEventInput {
  eventType: AuditEventType
  severity?: AuditSeverity
  cycleId?: number
  goalId?: string
  observationId?: string
  decisionId?: string
  actionResultId?: string
  message: string
  details?: Record<string, unknown>
}

/** 审计查询条件 */
export interface AuditQuery {
  eventType?: AuditEventType
  severity?: AuditSeverity
  cycleId?: number
  goalId?: string
  startTime?: string
  endTime?: string
  /** 限制返回数量 */
  limit?: number
}

/** 审计统计 */
export interface AuditStats {
  totalEvents: number
  byType: Record<AuditEventType, number>
  bySeverity: Record<AuditSeverity, number>
  errorCount: number
  criticalCount: number
  firstEventAt?: string
  lastEventAt?: string
}
