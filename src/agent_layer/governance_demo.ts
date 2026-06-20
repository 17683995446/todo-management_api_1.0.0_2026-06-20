/**
 * 秩序化 Agent 治理综合演示
 *
 * 展示五大治理纪律如何协同工作：
 * 1. 生命周期管理 — 状态机约束，仅在合法状态执行
 * 2. 策略引擎 — 行动前评估，拒绝不合规行为
 * 3. 审计日志 — 全程记录，不可变可追溯
 * 4. 资源预算 — 资源约束，超限降级暂停
 * 5. 指标采集 — 结构化指标，可观测性
 *
 * 运行：npx tsx src/agent_layer/governance_demo.ts
 */
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteRepository } from '../core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../core_layer/data/model/app_config.js'
import { InMemoryCache } from '../core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../core_layer/logic/logger.js'
import { todoSqliteConfig } from '../core_layer/model/todo.js'
import type { Todo } from '../core_layer/model/todo.js'
import type { CycleResult } from './agent.interface.js'
import { AgentActor } from './core/actor.js'
import { RuleBasedDecisionEngine } from './core/decision_engine.js'
import { SqliteGoalQueue } from './core/goal_queue.js'
import { SystemObserver } from './core/observer.js'
import { AgentReflector } from './core/reflector.js'
import { TimerAgentScheduler } from './core/scheduler.js'
import { AuditTrail } from './governance/audit_trail.js'
import { LifecycleManager } from './governance/lifecycle_manager.js'
import { MetricsCollector } from './governance/metrics_collector.js'
import { OrderedAgentLoop } from './governance/ordered_agent_loop.js'
import {
  PolicyEngine,
  registerDefaultPolicies,
} from './governance/policy_engine.js'
import { ResourceBudget } from './governance/resource_budget.js'
import type { AuditEvent } from './model/audit.js'
import { auditSqliteConfig } from './model/audit_sqlite_config.js'
import type { Goal } from './model/goal.js'
import { goalSqliteConfig } from './model/goal_sqlite_config.js'
import { METRIC_NAMES } from './model/metrics.js'

const SEP = '═'.repeat(72)
const SUB = '─'.repeat(72)

function banner(title: string): void {
  console.log(`\n${SEP}`)
  console.log(`  ${title}`)
  console.log(SEP)
}

function printCycle(idx: number, r: CycleResult): void {
  console.log(`\n${SUB}`)
  console.log(
    `  循环 #${idx}  |  ${r.effective ? '✓ 有效行动' : '○ 空闲/阻止'}  |  ${r.durationMs}ms`,
  )
  console.log(SUB)
  console.log(
    `  观察: ${r.observation.systemHealth.status} | 异常: ${r.observation.anomalies.length}`,
  )
  console.log(
    `  决策: ${r.decision.actionType} (置信度: ${r.decision.confidence})`,
  )
  console.log(
    `  执行: ${r.actionResult.success ? '✓ 成功' : '✗ 失败'} - ${r.actionResult.error ?? 'OK'}`,
  )
  console.log(`  反思: ${r.reflection.outcome}`)
}

async function main(): Promise<void> {
  banner('秩序化 Agent 治理综合演示')

  // ─── 初始化 ───
  const config: AppConfig = {
    app: { name: 'governance-demo', version: '3.0.0', debug: false },
    server: { host: '127.0.0.1', port: 0 },
    database: { host: 'localhost', port: 5432, name: 'demo', user: 'demo' },
    logging: { level: 'error', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 },
  }
  const logger = new ConsoleLogger(config, 'gov-demo')

  const dbPath = join(tmpdir(), `gov-demo-${Date.now()}.db`)
  const goalRepo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
  const todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
  const auditRepo = new SqliteRepository<AuditEvent>(
    logger,
    dbPath,
    auditSqliteConfig,
  )
  const cache = new InMemoryCache<string, unknown>(logger, 30000)

  // 装配核心组件
  const goalQueue = new SqliteGoalQueue(logger, goalRepo)
  const observer = new SystemObserver(logger, todoRepo, cache)
  const decisionEngine = new RuleBasedDecisionEngine(logger)
  const actor = new AgentActor(logger, todoRepo, cache)
  const reflector = new AgentReflector(logger)
  const scheduler = new TimerAgentScheduler(logger, { intervalMs: 60_000 })

  // 装配治理组件
  const policyEngine = new PolicyEngine(logger)
  const auditTrail = new AuditTrail(logger, auditRepo)
  const resourceBudget = new ResourceBudget(logger)
  const lifecycle = new LifecycleManager(logger)
  const metrics = new MetricsCollector(logger)

  // 注册默认安全策略
  await registerDefaultPolicies(policyEngine)

  // 创建秩序化循环
  const loop = new OrderedAgentLoop(
    logger,
    goalQueue,
    observer,
    decisionEngine,
    actor,
    reflector,
    scheduler,
    lifecycle,
    policyEngine,
    auditTrail,
    resourceBudget,
    metrics,
  )

  try {
    // ═══════════════════════════════════════════════════════
    // 场景 1：生命周期管理 — 状态机约束
    // ═══════════════════════════════════════════════════════
    banner('场景 1：生命周期管理 — 状态机约束')
    console.log('初始状态:', lifecycle.getState())
    console.log('可执行:', lifecycle.canExecute())

    loop.start()
    console.log('启动后状态:', lifecycle.getState())
    console.log('可执行:', lifecycle.canExecute())
    console.log('合法下一状态:', lifecycle.getValidNextStates())

    // 执行一个循环
    const r1 = await loop.runCycle()
    printCycle(1, r1)

    const snap = lifecycle.getSnapshot()
    console.log('\n  生命周期快照:')
    console.log(`    当前状态: ${snap.currentState}`)
    console.log(`    循环次数: ${snap.cycleCount}`)
    console.log(`    运行时长: ${snap.totalUptimeMs}ms`)
    console.log(`    转换历史: ${snap.transitionHistory.length} 条`)

    // ═══════════════════════════════════════════════════════
    // 场景 2：审计日志 — 全程可追溯
    // ═══════════════════════════════════════════════════════
    banner('场景 2：审计日志 — 全程可追溯')
    await new Promise((resolve) => setTimeout(resolve, 100))

    const allEvents = await auditTrail.recent(100)
    console.log(`审计事件总数: ${allEvents.length}`)

    const eventsByType: Record<string, number> = {}
    for (const e of allEvents) {
      eventsByType[e.eventType] = (eventsByType[e.eventType] ?? 0) + 1
    }
    console.log('\n  按类型分布:')
    for (const [type, count] of Object.entries(eventsByType)) {
      console.log(`    ${type}: ${count}`)
    }

    const cycle1Events = await auditTrail.getByCycle(1)
    console.log('\n  循环 #1 的事件链:')
    for (const e of cycle1Events) {
      console.log(`    [${e.eventType}] ${e.message}`)
    }

    const stats = await auditTrail.stats()
    console.log(
      `\n  审计统计: 总计 ${stats.totalEvents} | 错误 ${stats.errorCount} | 严重 ${stats.criticalCount}`,
    )

    // ═══════════════════════════════════════════════════════
    // 场景 3：指标采集 — 可观测性
    // ═══════════════════════════════════════════════════════
    banner('场景 3：指标采集 — 可观测性')

    const metricSnapshot = metrics.snapshot()
    console.log('  指标快照:')
    console.log(`    采集时间: ${metricSnapshot.collectedAt}`)
    console.log('\n    计数器:')
    for (const [name, value] of Object.entries(metricSnapshot.counters)) {
      console.log(`      ${name}: ${value}`)
    }
    console.log('\n    计量器:')
    for (const [name, value] of Object.entries(metricSnapshot.gauges)) {
      console.log(`      ${name}: ${value}`)
    }
    console.log('\n    直方图:')
    for (const [name, stats] of Object.entries(metricSnapshot.histograms)) {
      console.log(
        `      ${name}: count=${stats.count} mean=${stats.mean.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms`,
      )
    }

    // ═══════════════════════════════════════════════════════
    // 场景 4：资源预算 — 超限降级
    // ═══════════════════════════════════════════════════════
    banner('场景 4：资源预算 — 超限降级')
    console.log('配置极小预算（每循环最多 1 次行动）...')

    // 先恢复 lifecycle 到 running（场景 3 可能因预算暂停）
    if (lifecycle.getState() === 'paused') {
      loop.start() // resume
    }

    resourceBudget.configure({
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 0,
          hardLimit: 0,
        },
      ],
    })
    resourceBudget.resetPeriod('per_cycle')

    console.log('预算检查:', resourceBudget.check())
    console.log('预期：循环被预算阻止，Agent 自动暂停\n')

    const r4 = await loop.runCycle()
    printCycle(4, r4)
    console.log(`  循环后状态: ${lifecycle.getState()} (应已暂停)`)

    // 恢复预算
    resourceBudget.configure({
      limits: [
        {
          dimension: 'actions',
          period: 'per_cycle',
          softLimit: 100,
          hardLimit: 200,
        },
      ],
    })
    resourceBudget.resetPeriod('per_cycle')
    loop.start() // resume from paused
    console.log(`  恢复后状态: ${lifecycle.getState()}`)

    // ═══════════════════════════════════════════════════════
    // 场景 5：策略引擎 — 行为约束
    // ═══════════════════════════════════════════════════════
    banner('场景 5：策略引擎 — 行为约束')

    // 列出已注册策略
    const policies = policyEngine.listPolicies()
    console.log(`已注册 ${policies.length} 条策略:`)
    for (const p of policies) {
      console.log(
        `  [${p.type}] ${p.name} (优先级:${p.priority}) - ${p.description}`,
      )
    }

    // 注册自定义策略：禁止 optimize 操作
    await policyEngine.registerPolicy({
      name: 'forbid-optimize',
      description: '演示期间禁止缓存优化操作',
      type: 'forbidden',
      scope: 'action',
      priority: 200,
      rule: 'actionType:optimize',
      denialReason: '演示策略：optimize 操作被禁止',
    })
    console.log('\n  新增策略: forbid-optimize (禁止 optimize 操作)')

    // 添加优化目标，触发 optimize 决策
    await goalQueue.add({
      type: 'optimization',
      description: 'Optimize cache for better performance',
      priority: 'high',
      source: 'user',
      maxAttempts: 3,
    })

    const r5 = await loop.runCycle()
    printCycle(5, r5)

    if (r5.decision.actionType === 'optimize') {
      console.log('  ✓ 策略生效: optimize 被拒绝')
      console.log(`  错误信息: ${r5.actionResult.error}`)
    }

    const violationStats = await policyEngine.getViolationStats()
    console.log('\n  策略违规统计:')
    for (const [name, count] of Object.entries(violationStats)) {
      console.log(`    ${name}: ${count} 次`)
    }

    // ═══════════════════════════════════════════════════════
    // 场景 6：多循环治理 — 综合运行
    // ═══════════════════════════════════════════════════════
    banner('场景 6：多循环治理 — 综合运行')

    // 注销限制策略，恢复正常运行
    await policyEngine.unregisterPolicy('forbid-optimize')
    resourceBudget.resetPeriod('per_cycle')

    // 添加维护目标
    await goalQueue.add({
      type: 'maintenance',
      description: 'Perform routine system maintenance',
      priority: 'medium',
      source: 'user',
      maxAttempts: 3,
    })

    console.log('执行 3 个连续循环...\n')
    for (let i = 0; i < 3; i++) {
      const r = await loop.runCycle()
      printCycle(6 + i, r)
    }

    // 最终指标
    console.log('\n  最终指标:')
    console.log(
      `    总循环数: ${metrics.getCounter(METRIC_NAMES.CYCLES_TOTAL)}`,
    )
    console.log(
      `    有效循环: ${metrics.getCounter(METRIC_NAMES.CYCLES_EFFECTIVE)}`,
    )
    console.log(
      `    成功行动: ${metrics.getCounter(METRIC_NAMES.ACTIONS_SUCCESS)}`,
    )
    console.log(
      `    失败行动: ${metrics.getCounter(METRIC_NAMES.ACTIONS_FAILURE)}`,
    )
    console.log(
      `    策略违规: ${metrics.getCounter(METRIC_NAMES.POLICY_VIOLATIONS)}`,
    )
    console.log(
      `    目标完成: ${metrics.getCounter(METRIC_NAMES.GOALS_COMPLETED)}`,
    )
    console.log(
      `    目标失败: ${metrics.getCounter(METRIC_NAMES.GOALS_FAILED)}`,
    )

    const finalHist = metrics.getHistogram(METRIC_NAMES.CYCLES_DURATION_MS)
    if (finalHist) {
      console.log(
        `    循环耗时: mean=${finalHist.mean.toFixed(1)}ms p95=${finalHist.p95.toFixed(1)}ms`,
      )
    }

    // 最终审计
    const finalAuditStats = await auditTrail.stats()
    console.log(`\n  最终审计: ${finalAuditStats.totalEvents} 条事件`)

    // 最终生命周期
    const finalSnap = lifecycle.getSnapshot()
    console.log(
      `  最终状态: ${finalSnap.currentState} | 循环: ${finalSnap.cycleCount} | 运行: ${finalSnap.totalUptimeMs}ms`,
    )

    // ═══════════════════════════════════════════════════════
    // 优雅停止
    // ═══════════════════════════════════════════════════════
    banner('优雅停止')
    loop.stop()
    console.log('最终状态:', lifecycle.getState())
    console.log('转换历史:')
    for (const t of lifecycle.getHistory()) {
      console.log(`  ${t.from} → ${t.to} (${t.event}) ${t.reason ?? ''}`)
    }

    banner('秩序化治理演示完成')
    console.log('  五大治理纪律已全部展示:')
    console.log('  ✓ 生命周期管理 — 状态机约束执行')
    console.log('  ✓ 策略引擎 — 行为约束与拒绝')
    console.log('  ✓ 审计日志 — 全程事件可追溯')
    console.log('  ✓ 资源预算 — 超限自动降级')
    console.log('  ✓ 指标采集 — 运行可观测性')
    console.log('\n  自主性 + 纪律 = 可信赖的自驱')
  } finally {
    cache.close()
    goalRepo.close()
    todoRepo.close()
    auditRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  }
}

main().catch((err) => {
  console.error('Demo failed:', err)
  process.exit(1)
})
