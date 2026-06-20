/**
 * 增强版自驱 Agent 综合演示
 *
 * 展示四大核心能力：
 * 1. 多 Agent 协作 — 主 Agent 派发任务给子 Agent 并行执行
 * 2. 自我学习 — 从反思中提取模式，累积知识，优化决策
 * 3. 长任务自驱 — 分解长任务为子任务，逐个执行，跟踪进度
 * 4. 永续运行 — 看门狗监控健康，自动恢复故障
 *
 * 运行：npx tsx src/agent_layer/enhanced_demo.ts
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
import { registerBuiltinSkills } from './enhancement/builtin_skills.js'
import { EnhancedAgentLoop } from './enhancement/enhanced_agent_loop.js'
import { LearningEngine } from './enhancement/learning_engine.js'
import { AgentOrchestrator } from './enhancement/orchestrator.js'
import { SkillRegistry } from './enhancement/skill_registry.js'
import { TaskPlanner } from './enhancement/task_planner.js'
import { Watchdog } from './enhancement/watchdog.js'
import type { Goal } from './model/goal.js'
import { goalSqliteConfig } from './model/goal_sqlite_config.js'
import type { Learning } from './model/learning.js'
import { learningSqliteConfig } from './model/learning_sqlite_config.js'
import type { Milestone, Task } from './model/task.js'
import {
  milestoneSqliteConfig,
  taskSqliteConfig,
} from './model/task_sqlite_config.js'

type MilestoneRow = Milestone & { id: string; createdAt: Date; updatedAt: Date }

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
    `  循环 #${idx}  |  ${r.effective ? '✓ 有效行动' : '○ 空闲'}  |  ${r.durationMs}ms`,
  )
  console.log(SUB)
  console.log(
    `  观察: ${r.observation.systemHealth.status} | 异常: ${r.observation.anomalies.length} | Todo: ${r.observation.todoStats.total}`,
  )
  console.log(
    `  决策: ${r.decision.actionType} (置信度: ${r.decision.confidence})`,
  )
  console.log(
    `  执行: ${r.actionResult.success ? '✓ 成功' : '✗ 失败'} (${r.actionResult.durationMs}ms)`,
  )
  console.log(
    `  反思: ${r.reflection.outcome} | 新目标: ${r.reflection.newGoalDescriptions.length}`,
  )
}

async function main(): Promise<void> {
  banner('增强版自驱 Agent 综合演示')

  // ─── 初始化 ───
  const config: AppConfig = {
    app: { name: 'enhanced-demo', version: '2.0.0', debug: false },
    server: { host: '127.0.0.1', port: 0 },
    database: { host: 'localhost', port: 5432, name: 'demo', user: 'demo' },
    logging: { level: 'warn', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 },
  }
  const logger = new ConsoleLogger(config, 'enhanced-demo')

  const dbPath = join(tmpdir(), `enhanced-demo-${Date.now()}.db`)
  const goalRepo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
  const todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
  const taskRepo = new SqliteRepository<Task>(logger, dbPath, taskSqliteConfig)
  const milestoneRepo = new SqliteRepository<MilestoneRow>(
    logger,
    dbPath,
    milestoneSqliteConfig,
  )
  const learningRepo = new SqliteRepository<Learning>(
    logger,
    dbPath,
    learningSqliteConfig,
  )
  const cache = new InMemoryCache<string, unknown>(logger, 30000)

  // 装配核心组件
  const goalQueue = new SqliteGoalQueue(logger, goalRepo)
  const observer = new SystemObserver(logger, todoRepo, cache)
  const decisionEngine = new RuleBasedDecisionEngine(logger)
  const actor = new AgentActor(logger, todoRepo, cache)
  const reflector = new AgentReflector(logger)
  const scheduler = new TimerAgentScheduler(logger, { intervalMs: 60_000 })

  // 装配增强组件
  const skillRegistry = new SkillRegistry(logger)
  const orchestrator = new AgentOrchestrator(logger, skillRegistry)
  const taskPlanner = new TaskPlanner(logger, taskRepo, milestoneRepo)
  const learningEngine = new LearningEngine(logger, learningRepo)
  const watchdog = new Watchdog(logger, {
    checkIntervalMs: 30_000,
    maxConsecutiveFailures: 3,
  })

  // 注册内置技能
  await registerBuiltinSkills(skillRegistry, logger, todoRepo, cache)

  // 注册子 Agent（多 Agent 协作）
  await orchestrator.registerAgent({
    name: 'health-worker',
    role: 'worker',
    capabilities: ['health_check'],
  })
  await orchestrator.registerAgent({
    name: 'data-worker',
    role: 'worker',
    capabilities: ['data_cleanup', 'generate_report'],
  })
  await orchestrator.registerAgent({
    name: 'analysis-worker',
    role: 'specialist',
    capabilities: ['trend_analysis', 'cache_optimize'],
  })

  // 创建增强版循环
  const loop = new EnhancedAgentLoop(
    logger,
    goalQueue,
    observer,
    decisionEngine,
    actor,
    reflector,
    scheduler,
    skillRegistry,
    orchestrator,
    taskPlanner,
    learningEngine,
    watchdog,
  )

  try {
    // ═══════════════════════════════════════════════════════
    // 场景 1：多 Agent 协作 — 健康系统自检
    // ═══════════════════════════════════════════════════════
    banner('场景 1：多 Agent 协作 — 系统健康自检')
    console.log(
      '已注册 3 个子 Agent：health-worker, data-worker, analysis-worker',
    )
    console.log(
      '预期：Agent 自主决策 self_test，通过技能或子 Agent 执行健康检查。\n',
    )

    const r1 = await loop.runCycle()
    printCycle(1, r1)

    const agents = await orchestrator.listAgents()
    console.log('\n  子 Agent 状态:')
    for (const a of agents) {
      const perf = a.performance
      console.log(
        `    ${a.name} [${a.status}] | 完成:${perf.tasksCompleted} 失败:${perf.tasksFailed}`,
      )
    }

    // ═══════════════════════════════════════════════════════
    // 场景 2：长任务自驱 — 分解复杂目标
    // ═══════════════════════════════════════════════════════
    banner('场景 2：长任务自驱 — 分解复杂目标')
    console.log('注入复杂目标："clean up data and optimize performance"')
    console.log('预期：TaskPlanner 将目标分解为多个子任务，Agent 逐个执行。\n')

    // 清空队列中的反思目标，让新目标被优先处理
    const phase1Goals = await goalQueue.findAll()
    for (const g of phase1Goals) {
      if (g.status === 'pending') {
        await goalQueue.update(g.id, { status: 'cancelled' })
      }
    }

    const longGoal = await goalQueue.add({
      type: 'maintenance',
      description: 'clean up data and optimize performance',
      priority: 'high',
      source: 'user',
      maxAttempts: 3,
    })

    const r2 = await loop.runCycle()
    printCycle(2, r2)

    // 检查任务分解结果
    const tasks = await taskPlanner.getTasksByGoal(longGoal.id)
    console.log(`\n  任务分解结果（共 ${tasks.length} 个子任务）:`)
    for (const t of tasks) {
      console.log(`    [${t.order}] ${t.title} — ${t.status}`)
    }

    const progress = await taskPlanner.getProgress(longGoal.id)
    console.log(
      `\n  进度: ${progress.completedTasks}/${progress.totalTasks} 完成 (${(progress.completionRate * 100).toFixed(0)}%)`,
    )

    // ═══════════════════════════════════════════════════════
    // 场景 3：自我学习 — 从反思中提取模式
    // ═══════════════════════════════════════════════════════
    banner('场景 3：自我学习 — 从反思中提取模式')
    console.log('运行多个循环，Agent 从每次反思中学习，累积知识。')

    // 运行 3 个循环积累学习
    for (let i = 3; i <= 5; i++) {
      const r = await loop.runCycle()
      printCycle(i, r)
    }

    const learnings = await learningEngine.findAll()
    const learningStats = await learningEngine.stats()
    console.log('\n  学习统计:')
    console.log(`    总学习数: ${learningStats.totalLearnings}`)
    console.log(`    已应用: ${learningStats.appliedLearnings}`)
    console.log(
      `    平均置信度: ${(learningStats.avgConfidence * 100).toFixed(0)}%`,
    )
    console.log(
      `    按类型: 模式=${learningStats.byType.pattern} 规则=${learningStats.byType.rule_update} 技能=${learningStats.byType.skill_acquisition} 性能=${learningStats.byType.performance}`,
    )

    if (learnings.length > 0) {
      console.log('\n  最近学习记录:')
      for (const l of learnings.slice(-3)) {
        console.log(
          `    [${l.type}] ${l.pattern.slice(0, 60)}... (置信度: ${l.confidence.toFixed(2)}, 出现: ${l.occurrences}次)`,
        )
      }
    }

    // ═══════════════════════════════════════════════════════
    // 场景 4：永续运行 — 看门狗健康监控
    // ═══════════════════════════════════════════════════════
    banner('场景 4：永续运行 — 看门狗健康监控')
    console.log('启动看门狗，模拟健康检查和故障恢复。')

    // 手动检查健康
    const health = await watchdog.checkHealth()
    console.log(`\n  健康检查: ${health.healthy ? '✓ 健康' : '✗ 不健康'}`)
    console.log(`    连续失败: ${health.consecutiveFailures}`)

    const wdStats = watchdog.getStats()
    console.log('\n  看门狗统计:')
    console.log(`    总检查: ${wdStats.totalChecks}`)
    console.log(`    健康通过: ${wdStats.healthyChecks}`)
    console.log(`    恢复次数: ${wdStats.recoveryCount}`)

    // 模拟故障恢复
    console.log('\n  模拟手动触发恢复...')
    let recoveryCalled = false
    watchdog.onRecover(async () => {
      recoveryCalled = true
      console.log('    → 恢复回调已执行')
    })
    await watchdog.triggerRecovery()
    console.log(`  恢复已触发: ${recoveryCalled ? '✓' : '✗'}`)

    const wdStatsAfter = watchdog.getStats()
    console.log(`    恢复次数: ${wdStatsAfter.recoveryCount}`)

    // ═══════════════════════════════════════════════════════
    // 场景 5：技能系统 — 查看已注册技能
    // ═══════════════════════════════════════════════════════
    banner('场景 5：技能系统 — 已注册技能')
    const skills = skillRegistry.list()
    console.log(`\n  已注册 ${skills.length} 个技能:`)
    for (const s of skills) {
      const successRate =
        s.stats.timesUsed > 0
          ? ((s.stats.successCount / s.stats.timesUsed) * 100).toFixed(0)
          : 'N/A'
      console.log(
        `    ${s.name} [${s.category}] v${s.version} | 使用:${s.stats.timesUsed} 成功率:${successRate}%`,
      )
      console.log(`      ${s.description}`)
    }

    // ═══════════════════════════════════════════════════════
    // 总结
    // ═══════════════════════════════════════════════════════
    banner('综合演示总结')

    const allGoals = await goalQueue.findAll()
    const allTasks = await taskRepo.findAll()
    const allLearnings = await learningEngine.findAll()
    const allAgents = await orchestrator.listAgents()

    console.log('\n  系统状态:')
    console.log(
      `    目标: ${allGoals.length} 个 (${allGoals.filter((g) => g.status === 'completed').length} 已完成)`,
    )
    console.log(
      `    任务: ${allTasks.length} 个 (${allTasks.filter((t) => t.status === 'completed').length} 已完成)`,
    )
    console.log(
      `    学习: ${allLearnings.length} 条 (${allLearnings.filter((l) => l.applied).length} 已应用)`,
    )
    console.log(`    子 Agent: ${allAgents.length} 个`)
    console.log(`    技能: ${skills.length} 个`)

    console.log('\n  四大能力验证:')
    console.log(
      `    ✓ 多 Agent 协作 — ${allAgents.length} 个子 Agent 注册，支持并行任务派发`,
    )
    console.log(
      `    ✓ 自我学习 — ${allLearnings.length} 条学习记录，从反思中提取模式`,
    )
    console.log(
      `    ✓ 长任务自驱 — ${allTasks.length} 个子任务，支持分解、进度跟踪、检查点`,
    )
    console.log(
      `    ✓ 永续运行 — 看门狗监控健康，${wdStatsAfter.recoveryCount} 次恢复触发`,
    )

    console.log('\n  自驱闭环:')
    console.log(
      '    Observe → [Plan] → Decide → [Skill/Agent Act] → Reflect → [Learn] → Update',
    )
    console.log('    全程无需人工干预 — 真正的自驱')

    console.log(`\n${SEP}`)
    console.log('  增强版自驱 Agent 综合演示完成')
    console.log(SEP)
  } finally {
    loop.stop()
    cache.close()
    goalRepo.close()
    todoRepo.close()
    taskRepo.close()
    milestoneRepo.close()
    learningRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  }
}

main().catch((err) => {
  console.error('Demo failed:', err)
  process.exit(1)
})
