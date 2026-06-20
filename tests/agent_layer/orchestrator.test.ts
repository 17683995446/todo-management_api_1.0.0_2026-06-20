import { beforeEach, describe, expect, it } from 'vitest'
import { AgentOrchestrator } from '../../src/agent_layer/enhancement/orchestrator.js'
import { SkillRegistry } from '../../src/agent_layer/enhancement/skill_registry.js'
import type { SkillHandler } from '../../src/agent_layer/model/skill.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('AgentOrchestrator', () => {
  let logger: ConsoleLogger
  let skillRegistry: SkillRegistry
  let orchestrator: AgentOrchestrator
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'orch-test')
    skillRegistry = new SkillRegistry(logger)
    orchestrator = new AgentOrchestrator(logger, skillRegistry)
  })

  it('should register a sub-agent', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'worker-1',
      role: 'worker',
      capabilities: ['health_check', 'data_cleanup'],
    })

    expect(agent.id).toBeDefined()
    expect(agent.name).toBe('worker-1')
    expect(agent.role).toBe('worker')
    expect(agent.status).toBe('idle')
    expect(agent.capabilities).toContain('health_check')
  })

  it('should list all agents', async () => {
    await orchestrator.registerAgent({
      name: 'a1',
      role: 'worker',
      capabilities: [],
    })
    await orchestrator.registerAgent({
      name: 'a2',
      role: 'specialist',
      capabilities: [],
    })

    const agents = await orchestrator.listAgents()
    expect(agents).toHaveLength(2)
  })

  it('should unregister an agent', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'temp',
      role: 'worker',
      capabilities: [],
    })
    const removed = await orchestrator.unregisterAgent(agent.id)
    expect(removed).toBe(true)

    const agents = await orchestrator.listAgents()
    expect(agents).toHaveLength(0)
  })

  it('should return false when unregistering unknown agent', async () => {
    const removed = await orchestrator.unregisterAgent('nonexistent')
    expect(removed).toBe(false)
  })

  it('should find available agent by capability', async () => {
    await orchestrator.registerAgent({
      name: 'a1',
      role: 'worker',
      capabilities: ['health_check'],
    })
    await orchestrator.registerAgent({
      name: 'a2',
      role: 'worker',
      capabilities: ['data_cleanup'],
    })

    const agent = await orchestrator.findAvailable('data_cleanup')
    expect(agent?.name).toBe('a2')
  })

  it('should return null when no available agent has capability', async () => {
    await orchestrator.registerAgent({
      name: 'a1',
      role: 'worker',
      capabilities: ['health_check'],
    })

    const agent = await orchestrator.findAvailable('nonexistent_skill')
    expect(agent).toBeNull()
  })

  it('should not find busy agents as available', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'busy-agent',
      role: 'worker',
      capabilities: ['health_check'],
    })
    await orchestrator.updateAgentStatus(agent.id, 'busy')

    const found = await orchestrator.findAvailable('health_check')
    expect(found).toBeNull()
  })

  it('should assign task to agent', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'worker',
      role: 'worker',
      capabilities: ['test_skill'],
    })
    await orchestrator.assignTask(agent.id, 'task-1')

    const agents = await orchestrator.listAgents()
    expect(agents[0].status).toBe('busy')
    expect(agents[0].currentTaskId).toBe('task-1')
  })

  it('should throw when assigning task to unknown agent', async () => {
    await expect(orchestrator.assignTask('unknown', 'task-1')).rejects.toThrow(
      'not found',
    )
  })

  it('should throw when assigning task to busy agent', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'busy',
      role: 'worker',
      capabilities: [],
    })
    await orchestrator.assignTask(agent.id, 'task-1')

    await expect(orchestrator.assignTask(agent.id, 'task-2')).rejects.toThrow(
      'not available',
    )
  })

  it('should execute task via skill registry', async () => {
    // Register a skill
    const handler: SkillHandler = {
      canHandle: (ctx) => ctx.params.action === 'test',
      execute: async () => ({
        success: true,
        output: { done: true },
        durationMs: 0,
      }),
    }
    await skillRegistry.register({
      name: 'test_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    // Register an agent with that capability
    const agent = await orchestrator.registerAgent({
      name: 'worker',
      role: 'worker',
      capabilities: ['test_skill'],
    })

    const result = await orchestrator.executeTask(agent.id, 'task-1', {
      action: 'test',
    })

    expect(result.agentId).toBe(agent.id)
    expect(result.taskId).toBe('task-1')
    expect(result.success).toBe(true)
    expect(result.output).toEqual({ done: true })
  })

  it('should track performance stats after execution', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await skillRegistry.register({
      name: 'perf_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    const agent = await orchestrator.registerAgent({
      name: 'perf-worker',
      role: 'worker',
      capabilities: ['perf_skill'],
    })

    await orchestrator.executeTask(agent.id, 't1', { action: 'x' })
    await orchestrator.executeTask(agent.id, 't2', { action: 'x' })

    const perf = await orchestrator.getPerformance(agent.id)
    expect(perf?.tasksCompleted).toBe(2)
    expect(perf?.tasksFailed).toBe(0)
    expect(perf?.avgTaskDurationMs).toBeGreaterThanOrEqual(0)
    expect(perf?.lastActiveAt).toBeDefined()
  })

  it('should track failures in performance stats', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => {
        throw new Error('skill failed')
      },
    }
    await skillRegistry.register({
      name: 'fail_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    const agent = await orchestrator.registerAgent({
      name: 'fail-worker',
      role: 'worker',
      capabilities: ['fail_skill'],
    })

    const result = await orchestrator.executeTask(agent.id, 't1', {
      action: 'x',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('skill failed')

    const perf = await orchestrator.getPerformance(agent.id)
    expect(perf?.tasksFailed).toBe(1)
    expect(perf?.tasksCompleted).toBe(0)
  })

  it('should reset agent to idle after task completion', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
    }
    await skillRegistry.register({
      name: 'reset_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    const agent = await orchestrator.registerAgent({
      name: 'reset-worker',
      role: 'worker',
      capabilities: ['reset_skill'],
    })

    await orchestrator.executeTask(agent.id, 't1', { action: 'x' })

    const agents = await orchestrator.listAgents()
    expect(agents[0].status).toBe('idle')
    expect(agents[0].currentTaskId).toBeUndefined()
  })

  it('should reset agent to idle even after failure', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => {
        throw new Error('boom')
      },
    }
    await skillRegistry.register({
      name: 'err_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    const agent = await orchestrator.registerAgent({
      name: 'err-worker',
      role: 'worker',
      capabilities: ['err_skill'],
    })

    await orchestrator.executeTask(agent.id, 't1', { action: 'x' })

    const agents = await orchestrator.listAgents()
    expect(agents[0].status).toBe('idle')
  })

  it('should throw when executing task with unknown agent', async () => {
    await expect(orchestrator.executeTask('unknown', 't1', {})).rejects.toThrow(
      'not found',
    )
  })

  it('should throw when no skill can handle task', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'no-skill-worker',
      role: 'worker',
      capabilities: [],
    })

    const result = await orchestrator.executeTask(agent.id, 't1', {
      action: 'unknown_action',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('No skill available')
  })

  it('should prefer agent capability skills over other skills', async () => {
    const handler1: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({
        success: true,
        output: 'from-skill-1',
        durationMs: 0,
      }),
    }
    const handler2: SkillHandler = {
      canHandle: () => true,
      execute: async () => ({
        success: true,
        output: 'from-skill-2',
        durationMs: 0,
      }),
    }
    await skillRegistry.register({
      name: 'skill_1',
      description: 'd',
      category: 'custom',
      handler: handler1,
    })
    await skillRegistry.register({
      name: 'skill_2',
      description: 'd',
      category: 'custom',
      handler: handler2,
    })

    const agent = await orchestrator.registerAgent({
      name: 'pref-worker',
      role: 'worker',
      capabilities: ['skill_2'], // Agent only has skill_2
    })

    const result = await orchestrator.executeTask(agent.id, 't1', {
      action: 'any',
    })
    expect(result.success).toBe(true)
    expect(result.output).toBe('from-skill-2')
  })

  it('should update agent status', async () => {
    const agent = await orchestrator.registerAgent({
      name: 'status-worker',
      role: 'worker',
      capabilities: [],
    })

    await orchestrator.updateAgentStatus(agent.id, 'failed')
    const agents = await orchestrator.listAgents()
    expect(agents[0].status).toBe('failed')
  })

  it('should support multiple agents executing in parallel', async () => {
    const handler: SkillHandler = {
      canHandle: () => true,
      execute: async () => {
        await new Promise((r) => setTimeout(r, 50))
        return { success: true, output: 'done', durationMs: 0 }
      },
    }
    await skillRegistry.register({
      name: 'parallel_skill',
      description: 'd',
      category: 'custom',
      handler,
    })

    const agent1 = await orchestrator.registerAgent({
      name: 'p1',
      role: 'worker',
      capabilities: ['parallel_skill'],
    })
    const agent2 = await orchestrator.registerAgent({
      name: 'p2',
      role: 'worker',
      capabilities: ['parallel_skill'],
    })

    const startTime = Date.now()
    const [r1, r2] = await Promise.all([
      orchestrator.executeTask(agent1.id, 't1', { action: 'x' }),
      orchestrator.executeTask(agent2.id, 't2', { action: 'x' }),
    ])
    const elapsed = Date.now() - startTime

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    // Parallel execution should be faster than sequential (2 * 50ms = 100ms)
    expect(elapsed).toBeLessThan(120)
  })
})
