import { beforeEach, describe, expect, it } from 'vitest'
import {
  PolicyEngine,
  registerDefaultPolicies,
} from '../../src/agent_layer/governance/policy_engine.js'
import type { PolicyContext } from '../../src/agent_layer/model/policy.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('PolicyEngine', () => {
  let logger: ConsoleLogger
  let engine: PolicyEngine
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'policy-test')
    engine = new PolicyEngine(logger)
  })

  const makeContext = (
    overrides: Partial<PolicyContext> = {},
  ): PolicyContext => ({
    actionType: 'self_test',
    actionParams: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  })

  it('should register a policy', async () => {
    const policy = await engine.registerPolicy({
      name: 'test-policy',
      description: 'Test policy',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:delete_user',
    })

    expect(policy.id).toBeDefined()
    expect(policy.name).toBe('test-policy')
    expect(policy.enabled).toBe(true)
    expect(policy.priority).toBe(0)
  })

  it('should throw on duplicate registration', async () => {
    await engine.registerPolicy({
      name: 'dup',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:*',
    })
    await expect(
      engine.registerPolicy({
        name: 'dup',
        description: 'd2',
        type: 'forbidden',
        scope: 'action',
        rule: 'actionType:*',
      }),
    ).rejects.toThrow('already exists')
  })

  it('should unregister a policy', async () => {
    await engine.registerPolicy({
      name: 'temp',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:*',
    })
    const removed = await engine.unregisterPolicy('temp')
    expect(removed).toBe(true)
    expect(engine.listPolicies()).toHaveLength(0)
  })

  it('should enable/disable policies', async () => {
    await engine.registerPolicy({
      name: 'toggle',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:*',
    })
    await engine.setEnabled('toggle', false)
    expect(engine.listPolicies()[0].enabled).toBe(false)
  })

  it('should list policies sorted by priority descending', async () => {
    await engine.registerPolicy({
      name: 'low',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      priority: 1,
      rule: 'actionType:*',
    })
    await engine.registerPolicy({
      name: 'high',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      priority: 100,
      rule: 'actionType:*',
    })
    await engine.registerPolicy({
      name: 'mid',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      priority: 50,
      rule: 'actionType:*',
    })

    const list = engine.listPolicies()
    expect(list[0].name).toBe('high')
    expect(list[1].name).toBe('mid')
    expect(list[2].name).toBe('low')
  })

  it('should allow action when no policy matches', async () => {
    await engine.registerPolicy({
      name: 'forbid-delete',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:delete_user',
    })

    const result = await engine.evaluate(
      makeContext({ actionType: 'self_test' }),
    )
    expect(result.decision).toBe('allow')
    expect(result.triggeredPolicies).toHaveLength(0)
  })

  it('should deny action when forbidden policy matches', async () => {
    await engine.registerPolicy({
      name: 'forbid-delete',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:delete_user',
    })

    const result = await engine.evaluate(
      makeContext({ actionType: 'delete_user' }),
    )
    expect(result.decision).toBe('deny')
    expect(result.triggeredPolicies).toContain('forbid-delete')
    expect(result.reason).toBeDefined()
  })

  it('should deny action when forbidden policy matches with wildcard', async () => {
    await engine.registerPolicy({
      name: 'forbid-all',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:*',
    })

    const result = await engine.evaluate(
      makeContext({ actionType: 'any_action' }),
    )
    expect(result.decision).toBe('deny')
  })

  it('should not evaluate disabled policies', async () => {
    await engine.registerPolicy({
      name: 'forbid-all',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:*',
    })
    await engine.setEnabled('forbid-all', false)

    const result = await engine.evaluate(
      makeContext({ actionType: 'any_action' }),
    )
    expect(result.decision).toBe('allow')
  })

  it('should check resource limit policy', async () => {
    await engine.registerPolicy({
      name: 'limit-actions',
      description: '每循环最多 5 次行动',
      type: 'limit',
      scope: 'resource',
      priority: 50,
      rule: 'dimension:actions,threshold:5',
    })

    // 未超限
    const ok = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        resourceUsage: {
          actionsThisCycle: 3,
          durationThisCycleMs: 100,
          memoryUsageMb: 50,
        },
      }),
    )
    expect(ok.decision).toBe('allow')

    // 超限
    const denied = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        resourceUsage: {
          actionsThisCycle: 5,
          durationThisCycleMs: 100,
          memoryUsageMb: 50,
        },
      }),
    )
    expect(denied.decision).toBe('deny')
    expect(denied.reason).toContain('limit reached')
  })

  it('should check memory limit policy', async () => {
    await engine.registerPolicy({
      name: 'limit-memory',
      description: '内存超 256MB 拒绝',
      type: 'limit',
      scope: 'resource',
      priority: 50,
      rule: 'dimension:memory_mb,threshold:256',
    })

    const denied = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        resourceUsage: {
          actionsThisCycle: 1,
          durationThisCycleMs: 100,
          memoryUsageMb: 300,
        },
      }),
    )
    expect(denied.decision).toBe('deny')
  })

  it('should enforce schedule policy (off-hours)', async () => {
    await engine.registerPolicy({
      name: 'work-hours-only',
      description: '仅工作时间执行',
      type: 'schedule',
      scope: 'schedule',
      priority: 30,
      rule: 'hours:9-17',
      denialReason: '非工作时间',
    })

    // 凌晨 3 点
    const nightTime = new Date()
    nightTime.setHours(3, 0, 0, 0)
    const denied = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        timestamp: nightTime.toISOString(),
      }),
    )
    expect(denied.decision).toBe('deny')
    expect(denied.reason).toBe('非工作时间')
  })

  it('should allow during work hours', async () => {
    await engine.registerPolicy({
      name: 'work-hours-only',
      description: '仅工作时间执行',
      type: 'schedule',
      scope: 'schedule',
      priority: 30,
      rule: 'hours:9-17',
    })

    // 中午 12 点
    const noon = new Date()
    noon.setHours(12, 0, 0, 0)
    const result = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        timestamp: noon.toISOString(),
      }),
    )
    expect(result.decision).toBe('allow')
  })

  it('should track violation stats', async () => {
    await engine.registerPolicy({
      name: 'forbid-delete',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      rule: 'actionType:delete_user',
    })

    await engine.evaluate(makeContext({ actionType: 'delete_user' }))
    await engine.evaluate(makeContext({ actionType: 'delete_user' }))
    await engine.evaluate(makeContext({ actionType: 'delete_user' }))

    const stats = await engine.getViolationStats()
    expect(stats['forbid-delete']).toBe(3)
  })

  it('should evaluate higher priority policy first', async () => {
    // 低优先级允许
    await engine.registerPolicy({
      name: 'allow-all',
      description: 'd',
      type: 'quota',
      scope: 'global',
      priority: 1,
      rule: '',
    })
    // 高优先级禁止
    await engine.registerPolicy({
      name: 'forbid-high',
      description: 'd',
      type: 'forbidden',
      scope: 'action',
      priority: 100,
      rule: 'actionType:*',
    })

    const result = await engine.evaluate(
      makeContext({ actionType: 'self_test' }),
    )
    expect(result.decision).toBe('deny')
    expect(result.triggeredPolicies[0]).toBe('forbid-high')
  })

  it('should register default policies', async () => {
    await registerDefaultPolicies(engine)
    const policies = engine.listPolicies()
    expect(policies.length).toBeGreaterThanOrEqual(3)
    expect(policies.some((p) => p.name === 'forbid-delete-users')).toBe(true)
    expect(policies.some((p) => p.name === 'limit-actions-per-cycle')).toBe(
      true,
    )
    expect(policies.some((p) => p.name === 'limit-memory-usage')).toBe(true)
  })

  it('should deny delete_user with default policies', async () => {
    await registerDefaultPolicies(engine)

    const result = await engine.evaluate(
      makeContext({ actionType: 'delete_user' }),
    )
    expect(result.decision).toBe('deny')
  })

  it('should allow self_test with default policies (under limits)', async () => {
    await registerDefaultPolicies(engine)

    const result = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        resourceUsage: {
          actionsThisCycle: 1,
          durationThisCycleMs: 100,
          memoryUsageMb: 50,
        },
      }),
    )
    expect(result.decision).toBe('allow')
  })

  it('should deny when action limit exceeded with default policies', async () => {
    await registerDefaultPolicies(engine)

    const result = await engine.evaluate(
      makeContext({
        actionType: 'self_test',
        resourceUsage: {
          actionsThisCycle: 10,
          durationThisCycleMs: 100,
          memoryUsageMb: 50,
        },
      }),
    )
    expect(result.decision).toBe('deny')
  })
})
