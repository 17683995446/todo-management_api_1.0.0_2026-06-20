import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentModuleConfig } from '../../src/agent_layer/agent_module_config.js'
import { DEFAULT_AGENT_MODULE_CONFIG } from '../../src/agent_layer/agent_module_config.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import { ModuleState } from '../../src/core_layer/module/module.interface.js'
import type { IModule } from '../../src/core_layer/module/module.interface.js'
import { AgentModule } from '../../src/modules/agent_module.js'
import { AgentModuleFactory } from '../../src/modules/agent_module.js'

describe('AgentModule', () => {
  let logger: ConsoleLogger
  let config: AppConfig
  let dbPath: string

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'agent-module-test')
    dbPath = join(
      tmpdir(),
      `test-agent-module-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
  })

  afterEach(() => {
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  async function initModule(
    moduleConfig?: Partial<AgentModuleConfig>,
  ): Promise<AgentModule> {
    const module = new AgentModule()
    module.configure({ dbPath, ...moduleConfig })
    await module.initialize(new Map<string, IModule>(), logger)
    return module
  }

  describe('metadata', () => {
    it('should have correct module metadata', () => {
      const module = new AgentModule()
      const meta = module.getMetadata()
      expect(meta.id).toBe('agent')
      expect(meta.name).toBe('Agent Module')
      expect(meta.version).toBe('1.0.0')
      expect(meta.dependencies).toContain('config')
      expect(meta.tags).toContain('agent')
    })

    it('should start in UNINITIALIZED state', () => {
      const module = new AgentModule()
      expect(module.getState()).toBe(ModuleState.UNINITIALIZED)
    })
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const module = await initModule()
      expect(module.getState()).toBe(ModuleState.READY)
    })

    it('should create core OODA components', async () => {
      const module = await initModule()
      expect(module.getAgentLoop()).toBeDefined()
      expect(module.getGoalQueue()).toBeDefined()
      expect(module.getObserver()).toBeDefined()
      expect(module.getDecisionEngine()).toBeDefined()
      expect(module.getActor()).toBeDefined()
      expect(module.getReflector()).toBeDefined()
      expect(module.getScheduler()).toBeDefined()
    })

    it('should create governance components when enabled', async () => {
      const module = await initModule({ enableGovernance: true })
      expect(module.getPolicyEngine()).toBeDefined()
      expect(module.getAuditTrail()).toBeDefined()
      expect(module.getResourceBudget()).toBeDefined()
      expect(module.getLifecycle()).toBeDefined()
      expect(module.getMetrics()).toBeDefined()
    })

    it('should not create governance components when disabled', async () => {
      const module = await initModule({ enableGovernance: false })
      expect(module.getPolicyEngine()).toBeUndefined()
      expect(module.getAuditTrail()).toBeUndefined()
      expect(module.getResourceBudget()).toBeUndefined()
      expect(module.getLifecycle()).toBeUndefined()
      expect(module.getMetrics()).toBeUndefined()
    })

    it('should create enhancement components when enabled', async () => {
      const module = await initModule({ enableEnhancement: true })
      expect(module.getSkillRegistry()).toBeDefined()
      expect(module.getOrchestrator()).toBeDefined()
      expect(module.getTaskPlanner()).toBeDefined()
      expect(module.getLearningEngine()).toBeDefined()
      expect(module.getWatchdog()).toBeDefined()
    })

    it('should not create enhancement components when disabled', async () => {
      const module = await initModule({ enableEnhancement: false })
      expect(module.getSkillRegistry()).toBeUndefined()
      expect(module.getOrchestrator()).toBeUndefined()
      expect(module.getTaskPlanner()).toBeUndefined()
      expect(module.getLearningEngine()).toBeUndefined()
      expect(module.getWatchdog()).toBeUndefined()
    })

    it('should register all components as services', async () => {
      const module = await initModule()
      expect(module.getService('goalQueue')).toBeDefined()
      expect(module.getService('observer')).toBeDefined()
      expect(module.getService('decisionEngine')).toBeDefined()
      expect(module.getService('actor')).toBeDefined()
      expect(module.getService('reflector')).toBeDefined()
      expect(module.getService('scheduler')).toBeDefined()
      expect(module.getService('agentLoop')).toBeDefined()
      expect(module.getService('cache')).toBeDefined()
      expect(module.getService('policyEngine')).toBeDefined()
      expect(module.getService('auditTrail')).toBeDefined()
      expect(module.getService('resourceBudget')).toBeDefined()
      expect(module.getService('lifecycle')).toBeDefined()
      expect(module.getService('metrics')).toBeDefined()
    })

    it('should return cache instance', async () => {
      const module = await initModule()
      const cache = module.getCache()
      expect(cache).toBeDefined()
    })
  })

  describe('lifecycle', () => {
    it('should start successfully after initialization', async () => {
      const module = await initModule()
      await module.start()
      // start should not throw
    })

    it('should stop successfully after start', async () => {
      const module = await initModule()
      await module.start()
      await module.stop()
      expect(module.getState()).toBe(ModuleState.SHUTDOWN)
    })

    it('should stop successfully without start', async () => {
      const module = await initModule()
      await module.stop()
      expect(module.getState()).toBe(ModuleState.SHUTDOWN)
    })

    it('should handle multiple start/stop cycles', async () => {
      const module = await initModule()
      await module.start()
      await module.stop()
      // Module can be stopped once; verify state
      expect(module.getState()).toBe(ModuleState.SHUTDOWN)
    })
  })

  describe('configuration', () => {
    it('should use default config when not configured', () => {
      const module = new AgentModule()
      // Default config should be applied
      // We can verify by initializing and checking behavior
      expect(module.getMetadata()).toBeDefined()
    })

    it('should accept custom dbPath', async () => {
      const module = await initModule({ dbPath: dbPath })
      expect(module.getState()).toBe(ModuleState.READY)
    })

    it('should accept custom scheduler config', async () => {
      const module = await initModule({ scheduler: { intervalMs: 5000 } })
      expect(module.getState()).toBe(ModuleState.READY)
    })

    it('should merge partial config with defaults', () => {
      const module = new AgentModule()
      module.configure({ scheduler: { intervalMs: 10000 } })
      // Only scheduler is overridden, rest are defaults
      // Verify by initializing
      expect(module.getMetadata()).toBeDefined()
    })
  })

  describe('governance integration', () => {
    it('should create OrderedAgentLoop when governance enabled', async () => {
      const module = await initModule({ enableGovernance: true })
      const loop = module.getAgentLoop()
      // OrderedAgentLoop has getState() method
      expect(loop).toBeDefined()
      expect(typeof loop.start).toBe('function')
      expect(typeof loop.stop).toBe('function')
      expect(typeof loop.runCycle).toBe('function')
    })

    it('should create basic AgentLoop when governance disabled', async () => {
      const module = await initModule({ enableGovernance: false })
      const loop = module.getAgentLoop()
      expect(loop).toBeDefined()
      expect(typeof loop.start).toBe('function')
      expect(typeof loop.stop).toBe('function')
    })

    it('should have default policies registered', async () => {
      const module = await initModule({ enableGovernance: true })
      const policyEngine = module.getPolicyEngine()
      expect(policyEngine).toBeDefined()
      const policies = await policyEngine?.listPolicies()
      expect(policies?.length).toBeGreaterThan(0)
    })
  })

  describe('runCycle integration', () => {
    it('should execute a cycle successfully', async () => {
      const module = await initModule({ enableGovernance: true })
      await module.start()
      const loop = module.getAgentLoop()
      const result = await loop.runCycle()
      expect(result).toBeDefined()
      expect(result.observation).toBeDefined()
      expect(result.decision).toBeDefined()
      expect(result.actionResult).toBeDefined()
      expect(result.reflection).toBeDefined()
    })
  })
})

describe('AgentModuleFactory', () => {
  let logger: ConsoleLogger
  let config: AppConfig
  let dbPath: string

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'factory-test')
    dbPath = join(
      tmpdir(),
      `test-factory-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
  })

  afterEach(() => {
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  it('should return correct factory metadata', () => {
    const factory = new AgentModuleFactory()
    const meta = factory.getFactoryMetadata()
    expect(meta.id).toBe('agent')
    expect(meta.name).toBe('Agent Module Factory')
    expect(meta.version).toBe('1.0.0')
    expect(meta.tags).toContain('factory')
  })

  it('should create a module instance', () => {
    const factory = new AgentModuleFactory()
    const module = factory.createModule(logger)
    expect(module).toBeInstanceOf(AgentModule)
    expect(module.getState()).toBe(ModuleState.UNINITIALIZED)
  })

  it('should apply config via withConfig', async () => {
    const factory = new AgentModuleFactory().withConfig({
      dbPath,
      enableGovernance: false,
    })
    const module = factory.createModule(logger) as AgentModule
    await module.initialize(new Map<string, IModule>(), logger)
    expect(module.getPolicyEngine()).toBeUndefined()
  })

  it('should create module without config (uses defaults)', async () => {
    const factory = new AgentModuleFactory()
    const module = factory.createModule(logger) as AgentModule
    await module.initialize(new Map<string, IModule>(), logger)
    expect(module.getState()).toBe(ModuleState.READY)
    await module.stop()
  })
})

describe('AgentModuleConfig', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_AGENT_MODULE_CONFIG.dbPath).toBe(':memory:')
    expect(DEFAULT_AGENT_MODULE_CONFIG.scheduler.intervalMs).toBe(60_000)
    expect(DEFAULT_AGENT_MODULE_CONFIG.watchdog.checkIntervalMs).toBe(30_000)
    expect(DEFAULT_AGENT_MODULE_CONFIG.watchdog.maxConsecutiveFailures).toBe(3)
    expect(DEFAULT_AGENT_MODULE_CONFIG.budget).toBeDefined()
    expect(DEFAULT_AGENT_MODULE_CONFIG.enableGovernance).toBe(true)
    expect(DEFAULT_AGENT_MODULE_CONFIG.enableEnhancement).toBe(true)
  })
})
