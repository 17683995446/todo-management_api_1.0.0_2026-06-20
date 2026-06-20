import { randomUUID } from 'node:crypto'
import type { SqliteRepository } from '../../core_layer/data/access/sqlite_repository.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import type { IAuditTrail } from '../agent.interface.js'
import type {
  AuditEvent,
  AuditEventType,
  AuditQuery,
  AuditSeverity,
  AuditStats,
  CreateAuditEventInput,
} from '../model/audit.js'

/**
 * 审计日志
 *
 * 不可变地记录 Agent 的所有行为，支持全程可追溯。
 *
 * 设计原则：
 * - 审计事件一旦创建不可修改（append-only）
 * - 记录完整的因果链（observationId → decisionId → actionResultId）
 * - 支持按类型、严重级别、循环 ID、时间范围查询
 * - 审计与执行分离：行动失败不影响审计记录
 * - 持久化到 SQLite，跨重启保留
 *
 * 这是秩序化的问责机制：所有行为有据可查。
 */
export class AuditTrail implements IAuditTrail {
  constructor(
    private readonly logger: Logger,
    private readonly repo: SqliteRepository<AuditEvent>,
  ) {}

  async record(input: CreateAuditEventInput): Promise<AuditEvent> {
    const now = new Date()
    const event: AuditEvent = {
      id: randomUUID(),
      eventType: input.eventType,
      severity: input.severity ?? 'info',
      cycleId: input.cycleId,
      goalId: input.goalId,
      observationId: input.observationId,
      decisionId: input.decisionId,
      actionResultId: input.actionResultId,
      message: input.message,
      details: JSON.stringify(input.details ?? {}),
      eventTimestamp: now.toISOString(),
      createdAt: now,
      updatedAt: now,
    }

    const created = await this.repo.create({
      eventType: event.eventType,
      severity: event.severity,
      cycleId: event.cycleId,
      goalId: event.goalId,
      observationId: event.observationId,
      decisionId: event.decisionId,
      actionResultId: event.actionResultId,
      message: event.message,
      details: event.details,
      eventTimestamp: event.eventTimestamp,
    })

    if (event.severity === 'error' || event.severity === 'critical') {
      this.logger.warn('Audit event recorded (high severity)', {
        eventType: event.eventType,
        severity: event.severity,
        message: event.message,
      })
    }

    return created
  }

  async query(query: AuditQuery): Promise<AuditEvent[]> {
    let events = await this.repo.findAll()

    if (query.eventType) {
      events = events.filter((e) => e.eventType === query.eventType)
    }
    if (query.severity) {
      events = events.filter((e) => e.severity === query.severity)
    }
    if (query.cycleId !== undefined) {
      events = events.filter((e) => e.cycleId === query.cycleId)
    }
    if (query.goalId) {
      events = events.filter((e) => e.goalId === query.goalId)
    }
    if (query.startTime) {
      const startTime = query.startTime
      events = events.filter((e) => e.eventTimestamp >= startTime)
    }
    if (query.endTime) {
      const endTime = query.endTime
      events = events.filter((e) => e.eventTimestamp <= endTime)
    }

    // 按时间升序排列
    events.sort((a, b) => a.eventTimestamp.localeCompare(b.eventTimestamp))

    // 应用限制
    if (query.limit !== undefined && query.limit > 0) {
      events = events.slice(0, query.limit)
    }

    return events
  }

  async stats(): Promise<AuditStats> {
    const all = await this.repo.findAll()

    const byType: Record<AuditEventType, number> = {
      cycle_start: 0,
      cycle_end: 0,
      observation: 0,
      decision: 0,
      action_start: 0,
      action_end: 0,
      reflection: 0,
      policy_check: 0,
      policy_violation: 0,
      lifecycle: 0,
      recovery: 0,
      error: 0,
    }

    const bySeverity: Record<AuditSeverity, number> = {
      info: 0,
      warn: 0,
      error: 0,
      critical: 0,
    }

    let errorCount = 0
    let criticalCount = 0
    let firstEventAt: string | undefined
    let lastEventAt: string | undefined

    for (const e of all) {
      byType[e.eventType]++
      bySeverity[e.severity]++
      if (e.severity === 'error') errorCount++
      if (e.severity === 'critical') criticalCount++

      if (!firstEventAt || e.eventTimestamp < firstEventAt) {
        firstEventAt = e.eventTimestamp
      }
      if (!lastEventAt || e.eventTimestamp > lastEventAt) {
        lastEventAt = e.eventTimestamp
      }
    }

    return {
      totalEvents: all.length,
      byType,
      bySeverity,
      errorCount,
      criticalCount,
      firstEventAt,
      lastEventAt,
    }
  }

  async recent(limit: number): Promise<AuditEvent[]> {
    return this.query({ limit })
  }

  async getByCycle(cycleId: number): Promise<AuditEvent[]> {
    return this.query({ cycleId })
  }
}
