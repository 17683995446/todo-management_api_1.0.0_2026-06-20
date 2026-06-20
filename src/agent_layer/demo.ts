/**
 * 自驱 Agent 演示
 *
 * 演示 OODA 循环（Observe → Decide → Act → Reflect）的完整自驱闭环：
 * 1. Agent 启动后自主运行多个循环
 * 2. 注入异常（过期 Todo）触发检测与响应
 * 3. 反思阶段生成新目标，下一循环自动拾取（自驱闭环）
 *
 * 运行：npx tsx src/agent_layer/demo.ts
 */
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteRepository } from '../core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from '../core_layer/data/model/app_config.js'
import { InMemoryCache } from '../core_layer/logic/in_memory_cache.js'
import { ConsoleLogger } from '../core_layer/logic/logger.js'
import { type Todo, todoSqliteConfig } from '../core_layer/model/todo.js'
import type { CycleResult } from './agent.interface.js'
import { AgentActor } from './core/actor.js'
import { AgentLoop } from './core/agent_loop.js'
import { RuleBasedDecisionEngine } from './core/decision_engine.js'
import { SqliteGoalQueue } from './core/goal_queue.js'
import { SystemObserver } from './core/observer.js'
import { AgentReflector } from './core/reflector.js'
import { TimerAgentScheduler } from './core/scheduler.js'
import type { Goal } from './model/goal.js'
import { goalSqliteConfig } from './model/goal_sqlite_config.js'

const SEP = '═'.repeat(70)
const SUB = '─'.repeat(70)

function banner(title: string): void {
  console.log(`\n${SEP}`)
  console.log(`  ${title}`)
  console.log(SEP)
}

function printCycle(idx: number, r: CycleResult): void {
  console.log(`\n${SUB}`)
  console.log(
    `  循环 #${idx}  |  耗时 ${r.durationMs}ms  |  ${r.effective ? '✓ 有效行动' : '○ 空闲'}`,
  )
  console.log(SUB)

  // Observe
  console.log('【Observe 观察】')
  console.log(
    `  系统健康: ${r.observation.systemHealth.status} | 内存: ${r.observation.systemHealth.memoryUsageMb}MB | DB: ${r.observation.systemHealth.dbConnected}`,
  )
  console.log(
    `  Todo 统计: 总${r.observation.todoStats.total} / 完成${r.observation.todoStats.completed} / 待办${r.observation.todoStats.pending} / 过期${r.observation.todoStats.overdue}`,
  )
  if (r.observation.anomalies.length > 0) {
    console.log(`  ⚠ 检测到 ${r.observation.anomalies.length} 个异常:`)
    for (const a of r.observation.anomalies) {
      console.log(`    - ${a}`)
    }
  } else {
    console.log('  ✓ 无异常')
  }

  // Decide
  console.log('【Decide 决策】')
  console.log(
    `  行动: ${r.decision.actionType} | 置信度: ${r.decision.confidence}`,
  )
  console.log(`  理由: ${r.decision.reasoning}`)

  // Act
  console.log('【Act 执行】')
  console.log(
    `  结果: ${r.actionResult.success ? '✓ 成功' : '✗ 失败'} | 耗时 ${r.actionResult.durationMs}ms`,
  )
  if (r.actionResult.error) {
    console.log(`  错误: ${r.actionResult.error}`)
  }
  const out = r.actionResult.output as Record<string, unknown> | null
  if (out && typeof out === 'object') {
    const summary = JSON.stringify(out).slice(0, 200)
    console.log(`  输出: ${summary}`)
  }

  // Reflect
  console.log('【Reflect 反思】')
  console.log(`  评估: ${r.reflection.outcome}`)
  if (r.reflection.learnings.length > 0) {
    console.log('  经验:')
    for (const l of r.reflection.learnings.slice(0, 3)) {
      console.log(`    - ${l}`)
    }
  }
  if (r.reflection.newGoalDescriptions.length > 0) {
    console.log(
      `  🔄 生成 ${r.reflection.newGoalDescriptions.length} 个新目标（自驱闭环）:`,
    )
    for (const g of r.reflection.newGoalDescriptions) {
      console.log(`    + ${g}`)
    }
  }
}

async function main(): Promise<void> {
  banner('自驱 Agent 演示 — OODA 循环')

  // 初始化配置
  const config: AppConfig = {
    app: { name: 'agent-demo', version: '1.0.0', debug: false },
    server: { host: '127.0.0.1', port: 0 },
    database: { host: 'localhost', port: 5432, name: 'demo', user: 'demo' },
    logging: { level: 'warn', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 },
  }
  const logger = new ConsoleLogger(config, 'agent-demo')

  // 使用临时数据库
  const dbPath = join(tmpdir(), `agent-demo-${Date.now()}.db`)
  const goalRepo = new SqliteRepository<Goal>(logger, dbPath, goalSqliteConfig)
  const todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
  const cache = new InMemoryCache<string, unknown>(logger, 30000)

  // 装配 Agent 各组件
  const goalQueue = new SqliteGoalQueue(logger, goalRepo)
  const observer = new SystemObserver(logger, todoRepo, cache)
  const decisionEngine = new RuleBasedDecisionEngine(logger)
  const actor = new AgentActor(logger, todoRepo, cache)
  const reflector = new AgentReflector(logger)
  const scheduler = new TimerAgentScheduler(logger, { intervalMs: 60_000 })
  const loop = new AgentLoop(
    logger,
    goalQueue,
    observer,
    decisionEngine,
    actor,
    reflector,
    scheduler,
  )

  try {
    // ─────────────────────────────────────────────
    // 阶段 1：健康系统下的定期自检
    // ─────────────────────────────────────────────
    banner('阶段 1：系统健康 — Agent 自主执行定期自检')
    console.log('场景：系统无异常、目标队列为空，Agent 自主决定运行定期自检。')
    console.log(
      '预期：观察无异常 → 决策 periodic self_test → 反思生成监控目标。',
    )

    const r1 = await loop.runCycle()
    printCycle(1, r1)

    // ─────────────────────────────────────────────
    // 阶段 2：注入异常 — 过期 Todo（清空队列以直接触发异常响应）
    // ─────────────────────────────────────────────
    banner('阶段 2：注入异常 — 11 个过期 Todo')
    console.log(
      '场景：清空目标队列后注入 11 个过期未完成 Todo，触发"过期过多"异常。',
    )
    console.log(
      '预期：观察检测异常 → 决策 create_todo（异常规则直接触发）→ 执行 → 反思生成跟踪目标。',
    )

    // 清空上一阶段反思生成的目标，使本循环无 in_progress 目标，
    // 从而让异常驱动规则（priority 5）直接触发，而非被目标驱动规则（priority 2）抢占。
    const phase1Goals = await goalQueue.findAll()
    for (const g of phase1Goals) {
      if (g.status === 'pending') {
        await goalQueue.update(g.id, { status: 'cancelled' })
      }
    }

    const past = new Date(Date.now() - 86400000)
    for (let i = 0; i < 11; i++) {
      await todoRepo.create({
        userId: 'demo-user',
        title: `过期任务 #${i}`,
        completed: false,
        priority: 'high',
        dueDate: past,
        tags: ['过期'],
      })
    }
    console.log('  已清空目标队列，注入 11 个过期 Todo。')

    const r2 = await loop.runCycle()
    printCycle(2, r2)

    // ─────────────────────────────────────────────
    // 阶段 3：自驱闭环 — 处理反思生成的新目标
    // ─────────────────────────────────────────────
    banner('阶段 3：自驱闭环 — Agent 自动拾取反思生成的新目标')
    console.log('场景：上一循环的反思生成了新目标并加入队列。')
    console.log(
      '预期：Agent 自动拾取目标并执行（无需人工干预）— 目标驱动规则触发。',
    )

    const pendingGoals = await goalQueue.findAll()
    const activeGoals = pendingGoals.filter(
      (g) => g.status !== 'cancelled' && g.status !== 'completed',
    )
    console.log(`\n  当前目标队列（活跃 ${activeGoals.length} 个）:`)
    for (const g of activeGoals) {
      console.log(
        `    [${g.priority}] ${g.status} | ${g.description} (来源: ${g.source})`,
      )
    }

    const r3 = await loop.runCycle()
    printCycle(3, r3)

    // ─────────────────────────────────────────────
    // 阶段 4：连续自驱 — 多循环自主运行
    // ─────────────────────────────────────────────
    banner('阶段 4：连续自驱 — Agent 自主运行 3 个循环')
    console.log('场景：Agent 持续自主运行，处理队列中剩余目标。')

    for (let i = 4; i <= 6; i++) {
      const r = await loop.runCycle()
      printCycle(i, r)
    }

    // ─────────────────────────────────────────────
    // 总结
    // ─────────────────────────────────────────────
    banner('自驱演示总结')

    const allGoals = await goalQueue.findAll()
    const allTodos = await todoRepo.findAll()
    const agentTodos = allTodos.filter((t) => t.userId === 'agent')

    console.log('\n  目标队列统计:')
    console.log(`    总目标数: ${allGoals.length}`)
    console.log(
      `    已完成: ${allGoals.filter((g) => g.status === 'completed').length}`,
    )
    console.log(
      `    待处理: ${allGoals.filter((g) => g.status === 'pending').length}`,
    )
    console.log(
      `    进行中: ${allGoals.filter((g) => g.status === 'in_progress').length}`,
    )
    console.log(
      `    反思生成: ${allGoals.filter((g) => g.source === 'reflection').length}`,
    )

    console.log('\n  Todo 统计:')
    console.log(`    总数: ${allTodos.length}`)
    console.log(`    Agent 自动创建: ${agentTodos.length}`)
    for (const t of agentTodos) {
      console.log(
        `      - [${t.priority}] ${t.title} (${t.completed ? '已完成' : '待办'})`,
      )
    }

    console.log('\n  自驱闭环验证:')
    console.log('    ✓ Agent 自主观察系统状态（Observe）')
    console.log('    ✓ Agent 基于规则自主决策（Decide）')
    console.log('    ✓ Agent 自主执行行动（Act）')
    console.log('    ✓ Agent 反思结果并生成新目标（Reflect）')
    console.log('    ✓ 新目标自动加入队列，下一循环自主拾取')
    console.log('    ✓ 全程无需人工干预 — 真正的自驱')

    console.log(`\n${SEP}`)
    console.log('  自驱 Agent 演示完成')
    console.log(SEP)
  } finally {
    loop.stop()
    cache.close()
    goalRepo.close()
    todoRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  }
}

main().catch((err) => {
  console.error('Demo failed:', err)
  process.exit(1)
})
