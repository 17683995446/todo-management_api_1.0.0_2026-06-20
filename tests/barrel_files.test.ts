import { describe, expect, it } from 'vitest'

/**
 * Barrel file 导出验证测试
 *
 * 验证 index.ts 正确导出了所有公共 API。
 * 这确保外部消费者可以从此文件统一导入。
 */

describe('agent_layer barrel file', () => {
  it('should export core OODA components', async () => {
    const mod = await import('../src/agent_layer/index.js')
    expect(mod.AgentLoop).toBeDefined()
    expect(mod.SystemObserver).toBeDefined()
    expect(mod.RuleBasedDecisionEngine).toBeDefined()
    expect(mod.AgentActor).toBeDefined()
    expect(mod.AgentReflector).toBeDefined()
    expect(mod.SqliteGoalQueue).toBeDefined()
    expect(mod.TimerAgentScheduler).toBeDefined()
  })

  it('should export enhancement components', async () => {
    const mod = await import('../src/agent_layer/index.js')
    expect(mod.EnhancedAgentLoop).toBeDefined()
    expect(mod.SkillRegistry).toBeDefined()
    expect(mod.AgentOrchestrator).toBeDefined()
    expect(mod.TaskPlanner).toBeDefined()
    expect(mod.LearningEngine).toBeDefined()
    expect(mod.Watchdog).toBeDefined()
  })

  it('should export governance components', async () => {
    const mod = await import('../src/agent_layer/index.js')
    expect(mod.OrderedAgentLoop).toBeDefined()
    expect(mod.PolicyEngine).toBeDefined()
    expect(mod.AuditTrail).toBeDefined()
    expect(mod.ResourceBudget).toBeDefined()
    expect(mod.LifecycleManager).toBeDefined()
    expect(mod.MetricsCollector).toBeDefined()
  })

  it('should export policy utilities', async () => {
    const mod = await import('../src/agent_layer/index.js')
    expect(mod.DEFAULT_POLICIES).toBeDefined()
    expect(Array.isArray(mod.DEFAULT_POLICIES)).toBe(true)
    expect(typeof mod.registerDefaultPolicies).toBe('function')
  })

  it('should export builtin skill factories', async () => {
    const mod = await import('../src/agent_layer/index.js')
    expect(typeof mod.createDataCleanupSkill).toBe('function')
    expect(typeof mod.createHealthCheckSkill).toBe('function')
    expect(typeof mod.createCacheOptimizeSkill).toBe('function')
    expect(typeof mod.createReportSkill).toBe('function')
    expect(typeof mod.createTrendAnalysisSkill).toBe('function')
    expect(typeof mod.registerBuiltinSkills).toBe('function')
  })
})

describe('core_layer barrel file', () => {
  it('should export error classes', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.ErrorCode).toBeDefined()
    expect(mod.AppError).toBeDefined()
    expect(mod.NotFoundError).toBeDefined()
    expect(mod.AlreadyExistsError).toBeDefined()
    expect(mod.ValidationError).toBeDefined()
    expect(mod.StateTransitionError).toBeDefined()
    expect(mod.PolicyViolationError).toBeDefined()
    expect(mod.BudgetExceededError).toBeDefined()
    expect(mod.UnsupportedOperationError).toBeDefined()
    expect(mod.ConfigError).toBeDefined()
  })

  it('should export logger', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.LogLevel).toBeDefined()
    expect(mod.ConsoleLogger).toBeDefined()
  })

  it('should export repository classes', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.BaseRepository).toBeDefined()
    expect(mod.InMemoryRepository).toBeDefined()
    expect(mod.SqliteRepository).toBeDefined()
    expect(mod.MigrationManager).toBeDefined()
  })

  it('should export cache', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.InMemoryCache).toBeDefined()
  })

  it('should export module system', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.ModuleState).toBeDefined()
    expect(mod.BaseModule).toBeDefined()
    expect(mod.ModuleRegistry).toBeDefined()
    expect(mod.ModuleManager).toBeDefined()
    expect(mod.ModuleLoader).toBeDefined()
  })

  it('should export config utilities', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(typeof mod.validate_config).toBe('function')
    expect(typeof mod.get_env_var).toBe('function')
    expect(typeof mod.get_env).toBe('function')
  })

  it('should export service infrastructure', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.CircuitBreakerState).toBeDefined()
    expect(mod.ShutdownManager).toBeDefined()
    expect(mod.SlidingWindowRateLimiter).toBeDefined()
    expect(mod.BasicInputSanitizer).toBeDefined()
    expect(mod.AuthService).toBeDefined()
  })

  it('should export telemetry', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.TelemetryManager).toBeDefined()
    expect(typeof mod.generateTraceId).toBe('function')
    expect(typeof mod.generateSpanId).toBe('function')
  })

  it('should export models', async () => {
    const mod = await import('../src/core_layer/index.js')
    expect(mod.PRIORITY_ORDER).toBeDefined()
    expect(typeof mod.priorityWeight).toBe('function')
    expect(mod.todoSqliteConfig).toBeDefined()
    expect(mod.userSqliteConfig).toBeDefined()
  })
})

describe('top-level barrel file', () => {
  it('should re-export both layers', async () => {
    const mod = await import('../src/index.js')
    // From core_layer
    expect(mod.AppError).toBeDefined()
    expect(mod.ConsoleLogger).toBeDefined()
    expect(mod.SqliteRepository).toBeDefined()
    // From agent_layer
    expect(mod.AgentLoop).toBeDefined()
    expect(mod.OrderedAgentLoop).toBeDefined()
    expect(mod.PolicyEngine).toBeDefined()
  })
})
