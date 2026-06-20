import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuditTrail } from '../../src/agent_layer/governance/audit_trail.js'
import type { AuditEvent } from '../../src/agent_layer/model/audit.js'
import { auditSqliteConfig } from '../../src/agent_layer/model/audit_sqlite_config.js'
import { SqliteRepository } from '../../src/core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('AuditTrail', () => {
  let logger: ConsoleLogger
  let repo: SqliteRepository<AuditEvent>
  let audit: AuditTrail
  let dbPath: string
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'audit-test')
    dbPath = join(
      tmpdir(),
      `test-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    repo = new SqliteRepository<AuditEvent>(logger, dbPath, auditSqliteConfig)
    audit = new AuditTrail(logger, repo)
  })

  afterEach(() => {
    repo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should record an audit event', async () => {
    const event = await audit.record({
      eventType: 'cycle_start',
      message: 'Cycle 1 started',
    })

    expect(event.id).toBeDefined()
    expect(event.eventType).toBe('cycle_start')
    expect(event.severity).toBe('info')
    expect(event.message).toBe('Cycle 1 started')
    expect(event.eventTimestamp).toBeDefined()
  })

  it('should record event with all fields', async () => {
    const event = await audit.record({
      eventType: 'action_end',
      severity: 'warn',
      cycleId: 5,
      goalId: 'goal-1',
      observationId: 'obs-1',
      decisionId: 'dec-1',
      actionResultId: 'ar-1',
      message: 'Action completed with warning',
      details: { duration: 1500, warnings: ['slow'] },
    })

    expect(event.cycleId).toBe(5)
    expect(event.goalId).toBe('goal-1')
    expect(event.severity).toBe('warn')
    expect(event.details).toContain('duration')
  })

  it('should default severity to info', async () => {
    const event = await audit.record({
      eventType: 'observation',
      message: 'Observed system state',
    })
    expect(event.severity).toBe('info')
  })

  it('should serialize details to JSON', async () => {
    const event = await audit.record({
      eventType: 'decision',
      message: 'Decision made',
      details: { action: 'self_test', confidence: 0.8 },
    })

    const parsed = JSON.parse(event.details)
    expect(parsed.action).toBe('self_test')
    expect(parsed.confidence).toBe(0.8)
  })

  it('should handle empty details', async () => {
    const event = await audit.record({
      eventType: 'cycle_end',
      message: 'Cycle ended',
    })
    expect(JSON.parse(event.details)).toEqual({})
  })

  it('should query by event type', async () => {
    await audit.record({ eventType: 'cycle_start', message: 'c1' })
    await audit.record({ eventType: 'cycle_end', message: 'c1 end' })
    await audit.record({ eventType: 'cycle_start', message: 'c2' })

    const results = await audit.query({ eventType: 'cycle_start' })
    expect(results).toHaveLength(2)
    expect(results.every((e) => e.eventType === 'cycle_start')).toBe(true)
  })

  it('should query by severity', async () => {
    await audit.record({
      eventType: 'error',
      severity: 'error',
      message: 'err1',
    })
    await audit.record({
      eventType: 'observation',
      severity: 'info',
      message: 'ok',
    })
    await audit.record({
      eventType: 'error',
      severity: 'critical',
      message: 'critical',
    })

    const errors = await audit.query({ severity: 'error' })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('err1')
  })

  it('should query by cycle ID', async () => {
    await audit.record({ eventType: 'cycle_start', cycleId: 1, message: 'c1' })
    await audit.record({ eventType: 'cycle_start', cycleId: 2, message: 'c2' })
    await audit.record({
      eventType: 'cycle_end',
      cycleId: 1,
      message: 'c1 end',
    })

    const results = await audit.query({ cycleId: 1 })
    expect(results).toHaveLength(2)
    expect(results.every((e) => e.cycleId === 1)).toBe(true)
  })

  it('should query by goal ID', async () => {
    await audit.record({ eventType: 'decision', goalId: 'g1', message: 'd1' })
    await audit.record({ eventType: 'decision', goalId: 'g2', message: 'd2' })

    const results = await audit.query({ goalId: 'g1' })
    expect(results).toHaveLength(1)
    expect(results[0].goalId).toBe('g1')
  })

  it('should apply limit to query results', async () => {
    for (let i = 0; i < 10; i++) {
      await audit.record({ eventType: 'observation', message: `obs-${i}` })
    }

    const results = await audit.query({ limit: 3 })
    expect(results).toHaveLength(3)
  })

  it('should return events sorted by time ascending', async () => {
    await audit.record({ eventType: 'cycle_start', message: 'first' })
    await new Promise((r) => setTimeout(r, 10))
    await audit.record({ eventType: 'cycle_end', message: 'second' })

    const results = await audit.query({})
    expect(results[0].message).toBe('first')
    expect(results[1].message).toBe('second')
  })

  it('should get recent events', async () => {
    for (let i = 0; i < 5; i++) {
      await audit.record({ eventType: 'observation', message: `obs-${i}` })
    }

    const recent = await audit.recent(2)
    expect(recent).toHaveLength(2)
  })

  it('should get events by cycle', async () => {
    await audit.record({
      eventType: 'cycle_start',
      cycleId: 3,
      message: 'start',
    })
    await audit.record({ eventType: 'observation', cycleId: 3, message: 'obs' })
    await audit.record({ eventType: 'cycle_end', cycleId: 3, message: 'end' })
    await audit.record({
      eventType: 'cycle_start',
      cycleId: 4,
      message: 'next',
    })

    const events = await audit.getByCycle(3)
    expect(events).toHaveLength(3)
    expect(events.every((e) => e.cycleId === 3)).toBe(true)
  })

  it('should calculate stats correctly', async () => {
    await audit.record({ eventType: 'cycle_start', message: 'c1' })
    await audit.record({ eventType: 'cycle_end', message: 'c1' })
    await audit.record({
      eventType: 'error',
      severity: 'error',
      message: 'err',
    })
    await audit.record({
      eventType: 'recovery',
      severity: 'critical',
      message: 'crit',
    })

    const stats = await audit.stats()
    expect(stats.totalEvents).toBe(4)
    expect(stats.byType.cycle_start).toBe(1)
    expect(stats.byType.cycle_end).toBe(1)
    expect(stats.byType.error).toBe(1)
    expect(stats.byType.recovery).toBe(1)
    expect(stats.bySeverity.info).toBe(2)
    expect(stats.bySeverity.error).toBe(1)
    expect(stats.bySeverity.critical).toBe(1)
    expect(stats.errorCount).toBe(1)
    expect(stats.criticalCount).toBe(1)
  })

  it('should track first and last event timestamps', async () => {
    await audit.record({ eventType: 'cycle_start', message: 'first' })
    await new Promise((r) => setTimeout(r, 10))
    await audit.record({ eventType: 'cycle_end', message: 'last' })

    const stats = await audit.stats()
    expect(stats.firstEventAt).toBeDefined()
    expect(stats.lastEventAt).toBeDefined()
    expect((stats.firstEventAt ?? '') <= (stats.lastEventAt ?? '')).toBe(true)
  })

  it('should handle empty stats', async () => {
    const stats = await audit.stats()
    expect(stats.totalEvents).toBe(0)
    expect(stats.errorCount).toBe(0)
    expect(stats.firstEventAt).toBeUndefined()
    expect(stats.lastEventAt).toBeUndefined()
  })

  it('should persist events across instances', async () => {
    await audit.record({ eventType: 'cycle_start', message: 'persisted' })

    const newRepo = new SqliteRepository<AuditEvent>(
      logger,
      dbPath,
      auditSqliteConfig,
    )
    const newAudit = new AuditTrail(logger, newRepo)

    const all = await newAudit.query({})
    expect(all).toHaveLength(1)
    expect(all[0].message).toBe('persisted')

    newRepo.close()
  })

  it('should record policy violation events', async () => {
    await audit.record({
      eventType: 'policy_violation',
      severity: 'warn',
      message: 'Action denied by policy',
      details: { policy: 'forbid-delete', action: 'delete_user' },
    })

    const violations = await audit.query({ eventType: 'policy_violation' })
    expect(violations).toHaveLength(1)
    expect(violations[0].severity).toBe('warn')
  })

  it('should record lifecycle events', async () => {
    await audit.record({
      eventType: 'lifecycle',
      severity: 'info',
      message: 'State transition: ready → running',
      details: { from: 'ready', to: 'running' },
    })

    const events = await audit.query({ eventType: 'lifecycle' })
    expect(events).toHaveLength(1)
  })
})
