import type { SqliteEntityConfig } from '../../core_layer/data/access/sqlite_repository.js'
import type { AuditEvent, AuditEventType, AuditSeverity } from './audit.js'

const VALID_EVENT_TYPES: AuditEventType[] = [
  'cycle_start',
  'cycle_end',
  'observation',
  'decision',
  'action_start',
  'action_end',
  'reflection',
  'policy_check',
  'policy_violation',
  'lifecycle',
  'recovery',
  'error',
]

const VALID_SEVERITIES: AuditSeverity[] = ['info', 'warn', 'error', 'critical']

/**
 * AuditEvent 的 SQLite 映射配置
 * 审计事件不可变，只有 createdAt，没有 updatedAt（但 BaseEntity 要求有 updatedAt，
 * 这里将 updatedAt 设为与 createdAt 相同，表示不可变）。
 */
export const auditSqliteConfig: SqliteEntityConfig<AuditEvent> = {
  tableName: 'agent_audit_events',
  columns: [
    { name: 'eventType', type: 'TEXT' },
    { name: 'severity', type: 'TEXT' },
    { name: 'cycleId', type: 'INTEGER', nullable: true },
    { name: 'goalId', type: 'TEXT', nullable: true },
    { name: 'observationId', type: 'TEXT', nullable: true },
    { name: 'decisionId', type: 'TEXT', nullable: true },
    { name: 'actionResultId', type: 'TEXT', nullable: true },
    { name: 'message', type: 'TEXT' },
    { name: 'details', type: 'TEXT' },
    { name: 'eventTimestamp', type: 'TEXT' },
  ],
  fromRow: (row: Record<string, unknown>): AuditEvent => {
    const eventType = VALID_EVENT_TYPES.includes(
      row.eventType as AuditEventType,
    )
      ? (row.eventType as AuditEventType)
      : 'error'
    const severity = VALID_SEVERITIES.includes(row.severity as AuditSeverity)
      ? (row.severity as AuditSeverity)
      : 'info'

    return {
      id: row.id as string,
      eventType,
      severity,
      cycleId: typeof row.cycleId === 'number' ? row.cycleId : undefined,
      goalId: (row.goalId as string) || undefined,
      observationId: (row.observationId as string) || undefined,
      decisionId: (row.decisionId as string) || undefined,
      actionResultId: (row.actionResultId as string) || undefined,
      message: row.message as string,
      details: (row.details as string) || '{}',
      eventTimestamp: row.eventTimestamp as string,
      createdAt: new Date(row.createdAt as string),
      updatedAt: new Date(row.updatedAt as string),
    }
  },
  toValues: (
    entity: Partial<Omit<AuditEvent, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (entity.eventType !== undefined) values.eventType = entity.eventType
    if (entity.severity !== undefined) values.severity = entity.severity
    if (entity.cycleId !== undefined) values.cycleId = entity.cycleId
    if (entity.goalId !== undefined) values.goalId = entity.goalId
    if (entity.observationId !== undefined)
      values.observationId = entity.observationId
    if (entity.decisionId !== undefined) values.decisionId = entity.decisionId
    if (entity.actionResultId !== undefined)
      values.actionResultId = entity.actionResultId
    if (entity.message !== undefined) values.message = entity.message
    if (entity.details !== undefined) values.details = entity.details
    if (entity.eventTimestamp !== undefined)
      values.eventTimestamp = entity.eventTimestamp
    return values
  },
}
