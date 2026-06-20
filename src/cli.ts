#!/usr/bin/env node
/**
 * Todo CLI - 命令行待办事项管理工具
 *
 * 用法:
 *   npx tsx src/cli.ts <command> [options]
 *
 * 命令:
 *   list [--user <username>] [--status pending|completed] [--priority low|medium|high|urgent]
 *   add --title <title> [--user <username>] [--priority <p>] [--due <YYYY-MM-DD>] [--tags tag1,tag2]
 *   complete --id <todo-id> [--user <username>]
 *   uncomplete --id <todo-id> [--user <username>]
 *   delete --id <todo-id> [--user <username>]
 *   search <keyword> [--user <username>]
 *   stats [--user <username>]
 *   users - 列出所有用户
 *   init  - 初始化数据库并创建演示用户
 *   reset - 重置数据库（删除所有数据并重新初始化）
 *   agent run - 运行一次 Agent 自驱循环（OODA）
 *   agent status - 查看 Agent 状态
 *
 * 通用选项:
 *   --json  以 JSON 格式输出（适用于 list/add/complete/uncomplete/delete/search/stats/users）
 *
 * 环境变量:
 *   DB_PATH - 数据库路径（默认 data/todos.db）
 */

import { DEFAULT_AGENT_MODULE_CONFIG } from './agent_layer/agent_module_config.js'
import { SqliteRepository } from './core_layer/data/access/sqlite_repository.js'
import type { AppConfig } from './core_layer/data/model/app_config.js'
import { parse_config } from './core_layer/data/parse/config_parser.js'
import { get_env } from './core_layer/data/parse/env_loader.js'
import { AuthService } from './core_layer/logic/auth_service.js'
import {
  DEMO_PASSWORD,
  DEMO_USERNAME,
  seedDemoData,
} from './core_layer/logic/demo_seeder.js'
import { ConsoleLogger } from './core_layer/logic/logger.js'
import {
  PRIORITY_ORDER,
  type Todo,
  type TodoPriority,
  todoSqliteConfig,
} from './core_layer/model/todo.js'
import { type User, userSqliteConfig } from './core_layer/model/user.js'
import { AgentModule } from './modules/agent_module.js'

interface ParsedArgs {
  command: string
  options: Record<string, string>
  positional: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  if (args.length === 0) {
    return { command: 'help', options: {}, positional: [] }
  }
  const command = args[0]
  const options: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        options[key] = next
        i++
      } else {
        options[key] = 'true'
      }
    } else {
      positional.push(arg)
    }
  }
  return { command, options, positional }
}

function formatDate(d: Date | null): string {
  if (!d) return '-'
  const date = new Date(d)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function priorityLabel(p: TodoPriority): string {
  const labels: Record<TodoPriority, string> = {
    low: '低',
    medium: '中',
    high: '高',
    urgent: '紧急',
  }
  return labels[p] || '中'
}

function printTodo(todo: Todo, index?: number): void {
  const prefix = index !== undefined ? `${index + 1}. ` : '  '
  const status = todo.completed ? '[x]' : '[ ]'
  const priority = `[${priorityLabel(todo.priority)}]`
  const due = todo.dueDate ? ` 📅${formatDate(todo.dueDate)}` : ''
  const tags =
    todo.tags.length > 0 ? ` ${todo.tags.map((t) => `#${t}`).join(' ')}` : ''
  console.log(`${prefix}${status} ${priority} ${todo.title}${due}${tags}`)
  console.log(
    `     ID: ${todo.id} | 创建: ${formatDate(todo.createdAt)} | 更新: ${formatDate(todo.updatedAt)}`,
  )
}

async function findUserByUsername(
  userRepo: SqliteRepository<User>,
  username: string,
): Promise<User | null> {
  const allUsers = await userRepo.findAll()
  return allUsers.find((u) => u.username === username) ?? null
}

async function resolveUserId(
  userRepo: SqliteRepository<User>,
  options: Record<string, string>,
): Promise<string> {
  const username = options.user || 'demo'
  const user = await findUserByUsername(userRepo, username)
  if (!user) {
    console.error(
      `错误: 用户 "${username}" 不存在。运行 "npm run cli init" 创建演示用户，或使用 "users" 命令查看所有用户。`,
    )
    process.exit(1)
  }
  return user.id
}

async function main() {
  const { command, options, positional } = parseArgs(process.argv)

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`
Todo CLI - 命令行待办事项管理工具

命令:
  list      列出待办事项 [--user <用户名>] [--status pending|completed] [--priority low|medium|high|urgent]
  add       添加待办事项 --title <标题> [--user <用户名>] [--priority <p>] [--due <YYYY-MM-DD>] [--tags t1,t2]
  complete  标记完成 --id <ID> [--user <用户名>]
  uncomplete 取消完成 --id <ID> [--user <用户名>]
  delete    删除 --id <ID> [--user <用户名>]
  search    搜索 <关键词> [--user <用户名>]
  stats     统计信息 [--user <用户名>]
  users     列出所有用户
  init      初始化数据库并创建演示用户（首次使用前运行）
  reset     重置数据库（删除所有数据并重新初始化）
  agent     Agent 自驱循环控制:
              agent run     运行一次 OODA 循环
              agent status  查看 Agent 状态

通用选项:
  --json    以 JSON 格式输出（适用于 list/add/complete/uncomplete/delete/search/stats/users）
  --limit N list 命令分页大小（默认 20，0 表示全部）

环境变量:
  DB_PATH   数据库路径（默认 data/todos.db）
`)
    process.exit(0)
  }

  // 初始化
  const tempConfig: AppConfig = {
    app: { name: 'todo-cli', version: '1.0.0', debug: false },
    server: { host: '127.0.0.1', port: 0 },
    database: { host: 'localhost', port: 5432, name: 'todo', user: 'todo' },
    logging: { level: 'error', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 },
  }
  const tempLogger = new ConsoleLogger(tempConfig, 'temp')
  const env = get_env(tempLogger)
  const config = await parse_config(env, tempLogger)
  const logger = new ConsoleLogger(config, 'cli')

  const dbPath = process.env.DB_PATH || 'data/todos.db'
  const todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
  const userRepo = new SqliteRepository<User>(logger, dbPath, userSqliteConfig)

  try {
    switch (command) {
      case 'users': {
        const users = await userRepo.findAll()
        if (options.json === 'true') {
          console.log(
            JSON.stringify({
              success: true,
              data: users.map((u) => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
              })),
              count: users.length,
            }),
          )
        } else if (users.length === 0) {
          console.log('暂无用户。运行 "npm run cli init" 创建演示用户。')
        } else {
          console.log('\n用户列表:')
          for (const u of users) {
            console.log(`  - ${u.username} (${u.displayName}) | ID: ${u.id}`)
          }
        }
        break
      }

      case 'init': {
        const authService = new AuthService(logger)
        const seeded = await seedDemoData(
          logger,
          userRepo,
          todoRepo,
          authService,
        )
        if (seeded) {
          console.log('\n✅ 初始化完成！')
          console.log(`   数据库: ${dbPath}`)
          console.log(`   演示账号: ${DEMO_USERNAME} / ${DEMO_PASSWORD}`)
          console.log('\n现在可以使用以下命令开始:')
          console.log('  npm run cli list              # 列出待办事项')
          console.log('  npm run cli add --title "测试" # 添加待办')
          console.log('  npm run dev                    # 启动 HTTP 服务器')
        } else {
          console.log('\n数据库已存在演示数据，无需重复初始化。')
          console.log(`   演示账号: ${DEMO_USERNAME} / ${DEMO_PASSWORD}`)
        }
        break
      }

      case 'reset': {
        // 关闭当前连接，删除数据库文件（含 WAL/SHM 旁车文件），重新初始化
        todoRepo.close()
        userRepo.close()
        const { existsSync, rmSync } = await import('node:fs')
        const filesToDelete = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]
        for (const f of filesToDelete) {
          if (existsSync(f)) rmSync(f)
        }
        // 重新打开仓储（SqliteRepository 会自动建表）
        const newTodoRepo = new SqliteRepository<Todo>(
          logger,
          dbPath,
          todoSqliteConfig,
        )
        const newUserRepo = new SqliteRepository<User>(
          logger,
          dbPath,
          userSqliteConfig,
        )
        const authService = new AuthService(logger)
        await seedDemoData(logger, newUserRepo, newTodoRepo, authService)
        newTodoRepo.close()
        newUserRepo.close()
        console.log('\n✅ 数据库已重置并重新初始化！')
        console.log(`   数据库: ${dbPath}`)
        console.log(`   演示账号: ${DEMO_USERNAME} / ${DEMO_PASSWORD}`)
        break
      }

      case 'list': {
        const userId = await resolveUserId(userRepo, options)
        const where: Array<{
          column: string
          op: '=' | 'LIKE'
          value: unknown
        }> = [{ column: 'userId', op: '=', value: userId }]
        if (options.status === 'completed')
          where.push({ column: 'completed', op: '=', value: 1 })
        else if (options.status === 'pending')
          where.push({ column: 'completed', op: '=', value: 0 })
        if (
          options.priority &&
          PRIORITY_ORDER.includes(options.priority as TodoPriority)
        ) {
          where.push({ column: 'priority', op: '=', value: options.priority })
        }
        const limitNum =
          options.limit !== undefined ? Number.parseInt(options.limit, 10) : 20
        const useLimit = Number.isFinite(limitNum) && limitNum > 0
        const todos = await todoRepo.query({
          where,
          orderBy: 'createdAt',
          order: 'ASC',
          limit: useLimit ? limitNum : undefined,
        })
        if (options.json === 'true') {
          console.log(
            JSON.stringify({ success: true, data: todos, count: todos.length }),
          )
        } else if (todos.length === 0) {
          console.log('暂无待办事项。')
        } else {
          console.log(
            `\n待办事项 (${todos.length} 项${useLimit ? `，限 ${limitNum} 条` : ''}):`,
          )
          todos.forEach((t, i) => printTodo(t, i))
        }
        break
      }

      case 'add': {
        const userId = await resolveUserId(userRepo, options)
        const title = options.title
        if (!title) {
          console.error('错误: 请使用 --title 指定标题')
          process.exit(1)
        }
        const priority =
          (options.priority as TodoPriority | undefined) ?? 'medium'
        if (!PRIORITY_ORDER.includes(priority)) {
          console.error(
            `错误: 无效优先级 "${options.priority}"。可选: ${PRIORITY_ORDER.join(', ')}`,
          )
          process.exit(1)
        }
        const dueDate = options.due ? new Date(options.due) : null
        if (options.due && Number.isNaN(dueDate?.getTime())) {
          console.error('错误: 无效截止日期格式，请使用 YYYY-MM-DD')
          process.exit(1)
        }
        const tags = options.tags
          ? options.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean)
          : []
        const created = await todoRepo.create({
          userId,
          title,
          completed: false,
          priority,
          dueDate,
          tags,
        })
        if (options.json === 'true') {
          console.log(JSON.stringify({ success: true, data: created }))
        } else {
          console.log('✅ 已创建:')
          printTodo(created)
        }
        break
      }

      case 'complete':
      case 'uncomplete': {
        const userId = await resolveUserId(userRepo, options)
        const id = options.id
        if (!id) {
          console.error('错误: 请使用 --id 指定待办事项 ID')
          process.exit(1)
        }
        const existing = await todoRepo.findById(id)
        if (!existing || existing.userId !== userId) {
          console.error('错误: 未找到该待办事项')
          process.exit(1)
        }
        const updated = await todoRepo.update(id, {
          completed: command === 'complete',
        })
        if (updated) {
          if (options.json === 'true') {
            console.log(JSON.stringify({ success: true, data: updated }))
          } else {
            console.log(
              command === 'complete' ? '✅ 已标记完成:' : '✅ 已取消完成:',
            )
            printTodo(updated)
          }
        }
        break
      }

      case 'delete': {
        const userId = await resolveUserId(userRepo, options)
        const id = options.id
        if (!id) {
          console.error('错误: 请使用 --id 指定待办事项 ID')
          process.exit(1)
        }
        const existing = await todoRepo.findById(id)
        if (!existing || existing.userId !== userId) {
          console.error('错误: 未找到该待办事项')
          process.exit(1)
        }
        const deleted = await todoRepo.delete(id)
        if (deleted) {
          if (options.json === 'true') {
            console.log(
              JSON.stringify({ success: true, data: null, deletedId: id }),
            )
          } else {
            console.log('✅ 已删除:', existing.title)
          }
        }
        break
      }

      case 'search': {
        const userId = await resolveUserId(userRepo, options)
        const keyword = positional[0] ?? ''
        if (!keyword) {
          console.error('错误: 请提供搜索关键词')
          process.exit(1)
        }
        const todos = await todoRepo.query({
          where: [
            { column: 'userId', op: '=', value: userId },
            { column: 'title', op: 'LIKE', value: `%${keyword}%` },
          ],
          orderBy: 'createdAt',
          order: 'ASC',
        })
        if (options.json === 'true') {
          console.log(
            JSON.stringify({
              success: true,
              data: todos,
              count: todos.length,
              keyword,
            }),
          )
        } else if (todos.length === 0) {
          console.log(`未找到包含 "${keyword}" 的待办事项。`)
        } else {
          console.log(`\n搜索结果 (${todos.length} 项):`)
          todos.forEach((t, i) => printTodo(t, i))
        }
        break
      }

      case 'stats': {
        const userId = await resolveUserId(userRepo, options)
        const allTodos = await todoRepo.findAllFiltered({ userId })
        const completed = allTodos.filter((t) => t.completed).length
        const pending = allTodos.length - completed
        const overdue = allTodos.filter(
          (t) => t.dueDate && !t.completed && new Date(t.dueDate) < new Date(),
        ).length
        const byPriority: Record<string, number> = {}
        for (const t of allTodos) {
          byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1
        }
        const completionRate =
          allTodos.length === 0
            ? 0
            : Math.round((completed / allTodos.length) * 100)
        const statsData = {
          total: allTodos.length,
          completed,
          pending,
          overdue,
          byPriority,
          completionRate,
        }
        if (options.json === 'true') {
          console.log(JSON.stringify({ success: true, data: statsData }))
        } else {
          // 可视化进度条：20 格，每格代表 5%
          const barWidth = 20
          const filled = Math.round((completionRate / 100) * barWidth)
          const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)
          console.log('\n统计信息:')
          console.log(`  总计: ${allTodos.length}`)
          console.log(`  已完成: ${completed}`)
          console.log(`  待办: ${pending}`)
          console.log(`  已逾期: ${overdue}`)
          console.log(`  完成率: ${bar} ${completionRate}%`)
          console.log('  按优先级:')
          for (const p of PRIORITY_ORDER) {
            const count = byPriority[p] ?? 0
            const pBarWidth = 10
            const maxCount = Math.max(1, ...Object.values(byPriority))
            const pFilled = Math.round((count / maxCount) * pBarWidth)
            const pBar = '█'.repeat(pFilled) + '░'.repeat(pBarWidth - pFilled)
            console.log(`    ${priorityLabel(p)}: ${pBar} ${count}`)
          }
        }
        break
      }

      case 'agent': {
        const subCommand = positional[0] ?? ''

        const agentModule = new AgentModule()
        agentModule.configure({
          ...DEFAULT_AGENT_MODULE_CONFIG,
          dbPath,
          enableGovernance: true,
          enableEnhancement: false,
        })

        const moduleLogger = new ConsoleLogger(
          { ...config, logging: { level: 'warn', format: 'text' } },
          'agent-cli',
        )
        await agentModule.initialize(new Map(), moduleLogger)
        await agentModule.start()

        try {
          if (subCommand === 'run') {
            console.log(
              '\n═══════════════════════════════════════════════════════════════',
            )
            console.log('  Agent 自驱循环 — OODA')
            console.log(
              '═══════════════════════════════════════════════════════════════\n',
            )

            const loop = agentModule.getAgentLoop()
            const result = await loop.runCycle()

            console.log('【观察 Observe】')
            console.log(`  系统健康: ${result.observation.systemHealth.status}`)
            console.log(`  待办总数: ${result.observation.todoStats.total}`)
            console.log(`  过期待办: ${result.observation.todoStats.overdue}`)
            if (result.observation.anomalies.length > 0) {
              console.log(`  异常: ${result.observation.anomalies.join(', ')}`)
            }

            console.log('\n【决策 Decide】')
            console.log(`  行动类型: ${result.decision.actionType}`)
            console.log(
              `  置信度: ${(result.decision.confidence * 100).toFixed(0)}%`,
            )
            if (result.decision.reasoning) {
              console.log(`  理由: ${result.decision.reasoning}`)
            }

            console.log('\n【行动 Act】')
            console.log(
              `  执行: ${result.actionResult.success ? '✅ 成功' : '❌ 失败'}`,
            )
            if (result.actionResult.error) {
              console.log(`  错误: ${result.actionResult.error}`)
            }

            console.log('\n【反思 Reflect】')
            console.log(`  学习收获: ${result.reflection.learnings.length} 条`)
            for (const l of result.reflection.learnings) {
              console.log(`    - ${l}`)
            }

            console.log(`\n循环耗时: ${result.durationMs}ms`)
            console.log(`有效行动: ${result.effective ? '是' : '否'}`)
            console.log(
              '\n═══════════════════════════════════════════════════════════════',
            )
          } else if (subCommand === 'status') {
            console.log('\nAgent 状态:\n')
            console.log(`  模块状态: ${agentModule.getState()}`)
            const lifecycle = agentModule.getLifecycle()
            if (lifecycle) {
              console.log(`  生命周期: ${lifecycle.getState()}`)
            }
            const goalQueue = agentModule.getGoalQueue()
            const pendingCount = await goalQueue.pendingCount()
            console.log(`  目标队列: ${pendingCount} 个待处理`)
            const metrics = agentModule.getMetrics()
            if (metrics) {
              const snapshot = metrics.snapshot()
              console.log(
                `  指标计数器: ${Object.keys(snapshot.counters).length} 个`,
              )
            }
            console.log(
              `  调度器运行: ${agentModule.getScheduler().isRunning() ? '是' : '否'}`,
            )
            console.log('')
          } else {
            console.error('用法: agent <run|status>')
            process.exit(1)
          }
        } finally {
          await agentModule.stop()
        }
        break
      }

      default:
        console.error(`未知命令: ${command}。使用 "help" 查看可用命令。`)
        process.exit(1)
    }
  } finally {
    todoRepo.close()
    userRepo.close()
  }
}

main().catch((err) => {
  console.error('CLI 错误:', err.message)
  if (process.env.DEBUG) {
    console.error('堆栈:', err.stack)
  }
  process.exit(1)
})
