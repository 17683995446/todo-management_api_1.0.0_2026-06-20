import type { AuditEvent } from '../agent_layer/model/audit.js'
import { auditSqliteConfig } from '../agent_layer/model/audit_sqlite_config.js'
import type { Goal } from '../agent_layer/model/goal.js'
import { goalSqliteConfig } from '../agent_layer/model/goal_sqlite_config.js'
import type { Learning } from '../agent_layer/model/learning.js'
import { learningSqliteConfig } from '../agent_layer/model/learning_sqlite_config.js'
import type { Milestone, Task } from '../agent_layer/model/task.js'
import {
  milestoneSqliteConfig,
  taskSqliteConfig,
} from '../agent_layer/model/task_sqlite_config.js'
import { SqliteRepository } from '../core_layer/data/access/sqlite_repository.js'
import type { ICacheWithStats } from '../core_layer/logic/cache.interface.js'
import { InMemoryCache } from '../core_layer/logic/in_memory_cache.js'
import type { Logger } from '../core_layer/logic/logger.js'
import { todoSqliteConfig } from '../core_layer/model/todo.js'
import type { Todo } from '../core_layer/model/todo.js'
import { BaseModule } from '../core_layer/module/base_module.js'
import type {
  IModule,
  IModuleFactory,
  ModuleMetadata,
} from '../core_layer/module/module.interface.js'

import { AgentActor } from '../agent_layer/core/actor.js'
import { AgentLoop } from '../agent_layer/core/agent_loop.js'
import { RuleBasedDecisionEngine } from '../agent_layer/core/decision_engine.js'
import { SqliteGoalQueue } from '../agent_layer/core/goal_queue.js'
// 核心 OODA 组件
import { SystemObserver } from '../agent_layer/core/observer.js'
import { AgentReflector } from '../agent_layer/core/reflector.js'
import { TimerAgentScheduler } from '../agent_layer/core/scheduler.js'

import { AuditTrail } from '../agent_layer/governance/audit_trail.js'
import { LifecycleManager } from '../agent_layer/governance/lifecycle_manager.js'
import { MetricsCollector } from '../agent_layer/governance/metrics_collector.js'
import { OrderedAgentLoop } from '../agent_layer/governance/ordered_agent_loop.js'
// 治理组件
import {
  PolicyEngine,
  registerDefaultPolicies,
} from '../agent_layer/governance/policy_engine.js'
import { ResourceBudget } from '../agent_layer/governance/resource_budget.js'

import { LearningEngine } from '../agent_layer/enhancement/learning_engine.js'
import { AgentOrchestrator } from '../agent_layer/enhancement/orchestrator.js'
// 增强组件
import { SkillRegistry } from '../agent_layer/enhancement/skill_registry.js'
import { TaskPlanner } from '../agent_layer/enhancement/task_planner.js'
import { Watchdog } from '../agent_layer/enhancement/watchdog.js'

// 接口
import type {
  IActor,
  IAgentLoop,
  IAgentOrchestrator,
  IAgentScheduler,
  IAuditTrail,
  IDecisionEngine,
  IGoalQueue,
  ILearningEngine,
  ILifecycleManager,
  IMetricsCollector,
  IObserver,
  IPolicyEngine,
  IReflector,
  IResourceBudget,
  ISkillRegistry,
  ITaskPlanner,
  IWatchdog,
} from '../agent_layer/agent.interface.js'

import type { AgentModuleConfig } from '../agent_layer/agent_module_config.js'
import { DEFAULT_AGENT_MODULE_CONFIG } from '../agent_layer/agent_module_config.js'

/**
 * Agent 模块
 *
 * 将 Agent 层所有组件整合为一个可插拔模块，接入 core_layer 的模块系统。
 *
 * 设计原则：
 * - 通过模块系统管理组件生命周期（initialize → start → stop）
 * - 所有组件作为服务注册，其他模块可通过 getService 获取
 * - 支持配置开关：enableGovernance / enableEnhancement
 * - 核心组件始终创建，治理/增强组件按需创建
 * - stop() 时正确清理所有资源（关闭仓储、缓存、调度器）
 *
 * 这是模块化的核心：Agent 层不再是散落的文件，而是一个有生命周期的模块。
 */
export class AgentModule extends BaseModule {
  private config: AgentModuleConfig = DEFAULT_AGENT_MODULE_CONFIG

  // 数据层
  private goalRepo!: SqliteRepository<Goal>
  private todoRepo!: SqliteRepository<Todo>
  private auditRepo!: SqliteRepository<AuditEvent>
  private taskRepo!: SqliteRepository<Task>
  private milestoneRepo!: SqliteRepository<
    Milestone & { id: string; createdAt: Date; updatedAt: Date }
  >
  private learningRepo!: SqliteRepository<Learning>
  private cache!: InMemoryCache<string, unknown>

  // 核心 OODA 组件
  private goalQueue!: IGoalQueue
  private observer!: IObserver
  private decisionEngine!: IDecisionEngine
  private actor!: IActor
  private reflector!: IReflector
  private scheduler!: IAgentScheduler
  private agentLoop!: IAgentLoop

  // 治理组件（可选）
  private policyEngine?: IPolicyEngine
  private auditTrail?: IAuditTrail
  private resourceBudget?: IResourceBudget
  private lifecycle?: ILifecycleManager
  private metrics?: IMetricsCollector

  // 增强组件（可选）
  private skillRegistry?: ISkillRegistry
  private orchestrator?: IAgentOrchestrator
  private taskPlanner?: ITaskPlanner
  private learningEngine?: ILearningEngine
  private watchdog?: IWatchdog

  constructor() {
    super({
      id: 'agent',
      name: 'Agent Module',
      version: '1.0.0',
      description:
        'Self-driving agent with OODA loop, enhancement, and governance',
      dependencies: ['config'],
      tags: ['agent', 'core', 'self-driving'],
    })
  }

  /**
   * 配置模块
   */
  configure(config: Partial<AgentModuleConfig>): void {
    this.config = { ...DEFAULT_AGENT_MODULE_CONFIG, ...config }
  }

  protected async onInitialize(): Promise<void> {
    this.logger.info('Initializing agent module', {
      enableGovernance: this.config.enableGovernance,
      enableEnhancement: this.config.enableEnhancement,
    })

    // ── 创建数据层 ──
    this.goalRepo = new SqliteRepository<Goal>(
      this.logger,
      this.config.dbPath,
      goalSqliteConfig,
    )
    this.todoRepo = new SqliteRepository<Todo>(
      this.logger,
      this.config.dbPath,
      todoSqliteConfig,
    )
    this.auditRepo = new SqliteRepository<AuditEvent>(
      this.logger,
      this.config.dbPath,
      auditSqliteConfig,
    )
    this.cache = new InMemoryCache<string, unknown>(this.logger, 30_000)

    // ── 创建核心 OODA 组件 ──
    this.goalQueue = new SqliteGoalQueue(this.logger, this.goalRepo)
    this.observer = new SystemObserver(this.logger, this.todoRepo, this.cache)
    this.decisionEngine = new RuleBasedDecisionEngine(this.logger)
    this.actor = new AgentActor(this.logger, this.todoRepo, this.cache)
    this.reflector = new AgentReflector(this.logger)
    this.scheduler = new TimerAgentScheduler(this.logger, this.config.scheduler)

    // ── 创建治理组件（如果启用）──
    if (this.config.enableGovernance) {
      this.policyEngine = new PolicyEngine(this.logger)
      await registerDefaultPolicies(this.policyEngine)
      this.auditTrail = new AuditTrail(this.logger, this.auditRepo)
      this.resourceBudget = new ResourceBudget(this.logger, this.config.budget)
      this.lifecycle = new LifecycleManager(this.logger)
      this.metrics = new MetricsCollector(this.logger)

      // 创建秩序化循环（治理优先，确保安全合规）
      this.agentLoop = new OrderedAgentLoop(
        this.logger,
        this.goalQueue,
        this.observer,
        this.decisionEngine,
        this.actor,
        this.reflector,
        this.scheduler,
        this.lifecycle,
        this.policyEngine,
        this.auditTrail,
        this.resourceBudget,
        this.metrics,
      )
    } else {
      // 创建基础循环
      this.agentLoop = new AgentLoop(
        this.logger,
        this.goalQueue,
        this.observer,
        this.decisionEngine,
        this.actor,
        this.reflector,
        this.scheduler,
      )
    }

    // ── 创建增强组件（如果启用）──
    if (this.config.enableEnhancement) {
      this.taskRepo = new SqliteRepository<Task>(
        this.logger,
        this.config.dbPath,
        taskSqliteConfig,
      )
      this.milestoneRepo = new SqliteRepository<
        Milestone & { id: string; createdAt: Date; updatedAt: Date }
      >(this.logger, this.config.dbPath, milestoneSqliteConfig)
      this.learningRepo = new SqliteRepository<Learning>(
        this.logger,
        this.config.dbPath,
        learningSqliteConfig,
      )

      this.skillRegistry = new SkillRegistry(this.logger)
      this.orchestrator = new AgentOrchestrator(this.logger, this.skillRegistry)
      this.taskPlanner = new TaskPlanner(
        this.logger,
        this.taskRepo,
        this.milestoneRepo,
      )
      this.learningEngine = new LearningEngine(this.logger, this.learningRepo)
      this.watchdog = new Watchdog(this.logger, this.config.watchdog)
    }

    // ── 注册服务 ──
    this.registerService('goalQueue', this.goalQueue)
    this.registerService('observer', this.observer)
    this.registerService('decisionEngine', this.decisionEngine)
    this.registerService('actor', this.actor)
    this.registerService('reflector', this.reflector)
    this.registerService('scheduler', this.scheduler)
    this.registerService('agentLoop', this.agentLoop)
    this.registerService('cache', this.cache)

    if (this.policyEngine)
      this.registerService('policyEngine', this.policyEngine)
    if (this.auditTrail) this.registerService('auditTrail', this.auditTrail)
    if (this.resourceBudget)
      this.registerService('resourceBudget', this.resourceBudget)
    if (this.lifecycle) this.registerService('lifecycle', this.lifecycle)
    if (this.metrics) this.registerService('metrics', this.metrics)

    if (this.skillRegistry)
      this.registerService('skillRegistry', this.skillRegistry)
    if (this.orchestrator)
      this.registerService('orchestrator', this.orchestrator)
    if (this.taskPlanner) this.registerService('taskPlanner', this.taskPlanner)
    if (this.learningEngine)
      this.registerService('learningEngine', this.learningEngine)
    if (this.watchdog) this.registerService('watchdog', this.watchdog)

    this.logger.info('Agent module initialized', {
      services: Array.from(this.services.keys()),
    })
  }

  protected async onStart(): Promise<void> {
    this.logger.info('Starting agent module')
    // AgentLoop.start() 由调用方决定何时启动
  }

  protected async onStop(): Promise<void> {
    this.logger.info('Stopping agent module')

    // 停止调度器
    if (this.scheduler) {
      this.scheduler.stop()
    }

    // 停止看门狗
    if (this.watchdog) {
      this.watchdog.stop()
    }

    // 关闭缓存
    if (this.cache) {
      this.cache.close()
    }

    // 关闭仓储
    this.goalRepo?.close()
    this.todoRepo?.close()
    this.auditRepo?.close()
    this.taskRepo?.close()
    this.milestoneRepo?.close()
    this.learningRepo?.close()

    this.logger.info('Agent module stopped')
  }

  // ── 公共 getter 方法 ──

  getAgentLoop(): IAgentLoop {
    return this.agentLoop
  }

  getGoalQueue(): IGoalQueue {
    return this.goalQueue
  }

  getObserver(): IObserver {
    return this.observer
  }

  getDecisionEngine(): IDecisionEngine {
    return this.decisionEngine
  }

  getActor(): IActor {
    return this.actor
  }

  getReflector(): IReflector {
    return this.reflector
  }

  getScheduler(): IAgentScheduler {
    return this.scheduler
  }

  getPolicyEngine(): IPolicyEngine | undefined {
    return this.policyEngine
  }

  getAuditTrail(): IAuditTrail | undefined {
    return this.auditTrail
  }

  getResourceBudget(): IResourceBudget | undefined {
    return this.resourceBudget
  }

  getLifecycle(): ILifecycleManager | undefined {
    return this.lifecycle
  }

  getMetrics(): IMetricsCollector | undefined {
    return this.metrics
  }

  getSkillRegistry(): ISkillRegistry | undefined {
    return this.skillRegistry
  }

  getOrchestrator(): IAgentOrchestrator | undefined {
    return this.orchestrator
  }

  getTaskPlanner(): ITaskPlanner | undefined {
    return this.taskPlanner
  }

  getLearningEngine(): ILearningEngine | undefined {
    return this.learningEngine
  }

  getWatchdog(): IWatchdog | undefined {
    return this.watchdog
  }

  getCache(): ICacheWithStats<string, unknown> {
    return this.cache
  }
}

/**
 * Agent 模块工厂
 */
export class AgentModuleFactory implements IModuleFactory {
  private config: Partial<AgentModuleConfig> = {}

  /**
   * 设置模块配置
   */
  withConfig(config: Partial<AgentModuleConfig>): AgentModuleFactory {
    this.config = config
    return this
  }

  getFactoryMetadata(): ModuleMetadata {
    return {
      id: 'agent',
      name: 'Agent Module Factory',
      version: '1.0.0',
      description: 'Factory for creating Agent Module',
      tags: ['factory', 'agent'],
    }
  }

  createModule(logger: Logger): IModule {
    const module = new AgentModule()
    if (Object.keys(this.config).length > 0) {
      module.configure(this.config)
    }
    return module
  }
}
