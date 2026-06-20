import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceBudget } from '../../src/agent_layer/governance/resource_budget.js'
import { DEFAULT_BUDGET_CONFIG } from '../../src/agent_layer/model/budget.js'
import type { BudgetConfig } from '../../src/agent_layer/model/budget.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('ResourceBudget', () => {
  let logger: ConsoleLogger
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'budget-test')
  })

  it('should initialize with default config', () => {
    const budget = new ResourceBudget(logger)
    const cfg = budget.getConfig()
    expect(cfg.limits.length).toBeGreaterThan(0)
  })

  it('should initialize with custom config', () => {
    const customConfig: BudgetConfig = {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 3,
          hardLimit: 5,
        },
      ],
    }
    const budget = new ResourceBudget(logger, customConfig)
    expect(budget.getConfig().limits).toHaveLength(1)
  })

  it('should allow execution when under all limits', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 3)
    const result = budget.check()
    expect(result.allowed).toBe(true)
    expect(result.violatedLimits).toHaveLength(0)
  })

  it('should warn when over soft limit', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 5)
    const result = budget.check()
    expect(result.allowed).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].dimension).toBe('actions')
  })

  it('should deny when over hard limit', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 10)
    const result = budget.check()
    expect(result.allowed).toBe(false)
    expect(result.violatedLimits).toHaveLength(1)
    expect(result.violatedLimits[0].overHardLimit).toBe(true)
  })

  it('should track multiple dimensions independently', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
        {
          dimension: 'duration_ms',
          period: 'per_cycle',
          softLimit: 1000,
          hardLimit: 2000,
        },
      ],
    })

    budget.recordUsage('actions', 3)
    budget.recordUsage('duration_ms', 500)

    const usage = budget.getUsage()
    expect(usage).toHaveLength(2)
    expect(usage.find((u) => u.dimension === 'actions')?.used).toBe(3)
    expect(usage.find((u) => u.dimension === 'duration_ms')?.used).toBe(500)
  })

  it('should accumulate usage within same dimension', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 2)
    budget.recordUsage('actions', 3)

    const usage = budget.getUsage()
    expect(usage[0].used).toBe(5)
  })

  it('should reset per_cycle period', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 8)
    expect(budget.getUsage()[0].used).toBe(8)

    budget.resetPeriod('per_cycle')
    expect(budget.getUsage()[0].used).toBe(0)
  })

  it('should calculate utilization correctly', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 7)
    const usage = budget.getUsage()[0]
    expect(usage.utilization).toBeCloseTo(0.7)
    expect(usage.overSoftLimit).toBe(true)
    expect(usage.overHardLimit).toBe(false)
  })

  it('should reconfigure budget', () => {
    const budget = new ResourceBudget(logger)
    const originalLimits = budget.getConfig().limits.length

    budget.configure({
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 1,
          hardLimit: 2,
        },
      ],
    })

    expect(budget.getConfig().limits).toHaveLength(1)
    expect(budget.getConfig().limits).not.toHaveLength(originalLimits)
  })

  it('should clear usage on reconfigure', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    budget.recordUsage('actions', 5)
    budget.configure({
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
      ],
    })

    expect(budget.getUsage()[0].used).toBe(0)
  })

  it('should get memory usage from process', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'memory_mb',
          period: 'per_cycle',
          softLimit: 100000,
          hardLimit: 200000,
        },
      ],
    })

    const usage = budget.getUsage()[0]
    expect(usage.used).toBeGreaterThan(0)
    expect(usage.dimension).toBe('memory_mb')
  })

  it('should track subagent_calls dimension', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'subagent_calls',
          period: 'per_cycle',
          softLimit: 3,
          hardLimit: 5,
        },
      ],
    })

    budget.recordUsage('subagent_calls', 2)
    budget.recordUsage('subagent_calls', 2)

    const usage = budget.getUsage()[0]
    expect(usage.used).toBe(4)
    expect(usage.overSoftLimit).toBe(true)
    expect(usage.overHardLimit).toBe(false)
  })

  it('should track skill_executions dimension', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'skill_executions',
          period: 'per_cycle',
          softLimit: 3,
          hardLimit: 5,
        },
      ],
    })

    budget.recordUsage('skill_executions', 1)
    const result = budget.check()
    expect(result.allowed).toBe(true)
  })

  it('should deny when multiple dimensions exceed hard limit', () => {
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 5,
          hardLimit: 10,
        },
        {
          dimension: 'duration_ms',
          period: 'per_cycle',
          softLimit: 1000,
          hardLimit: 2000,
        },
      ],
    })

    budget.recordUsage('actions', 10)
    budget.recordUsage('duration_ms', 2000)

    const result = budget.check()
    expect(result.allowed).toBe(false)
    expect(result.violatedLimits).toHaveLength(2)
  })

  it('should reset per_minute period after time elapses', () => {
    vi.useFakeTimers()
    const budget = new ResourceBudget(logger, {
      limits: [
        {
          dimension: 'actions',
          period: 'per_minute',
          softLimit: 30,
          hardLimit: 60,
        },
      ],
    })

    budget.recordUsage('actions', 40)
    expect(budget.getUsage()[0].used).toBe(40)

    // Advance 61 seconds
    vi.advanceTimersByTime(61_000)
    budget.recordUsage('actions', 5)
    // Should have reset, so used should be 5 (not 45)
    expect(budget.getUsage()[0].used).toBe(5)

    vi.useRealTimers()
  })

  it('should work with default budget config', () => {
    const budget = new ResourceBudget(logger, DEFAULT_BUDGET_CONFIG)

    // Record some usage under limits
    budget.recordUsage('actions', 3)
    budget.recordUsage('duration_ms', 1000)

    const result = budget.check()
    expect(result.allowed).toBe(true)
  })
})
