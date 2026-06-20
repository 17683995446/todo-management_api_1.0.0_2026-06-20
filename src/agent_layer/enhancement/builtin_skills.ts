import type { IRepository } from '../../core_layer/data/access/repository.interface.js'
import type { ICacheWithStats } from '../../core_layer/logic/cache.interface.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import type { Todo } from '../../core_layer/model/todo.js'
import type { SkillContext, SkillHandler, SkillResult } from '../model/skill.js'
import type { RegisterSkillInput } from '../model/skill.js'

/**
 * 内置技能集
 *
 * Agent 开箱即用的实用技能。这些技能覆盖常见运维场景，
 * Agent 也可在运行时注册自定义技能扩展能力。
 *
 * 内置技能：
 * 1. data_cleanup — 清理旧的已完成 Todo（保留 7 天）
 * 2. health_check — 运行系统健康检查
 * 3. cache_optimize — 清理缓存优化性能
 * 4. generate_report — 生成系统状态报告
 * 5. trend_analysis — 分析异常趋势
 */

/** 创建数据清理技能 */
export function createDataCleanupSkill(
  todoRepo: IRepository<Todo>,
): RegisterSkillInput {
  const handler: SkillHandler = {
    canHandle(context: SkillContext): boolean {
      return (
        context.params.action === 'cleanup' ||
        context.params.action === 'cleanup_completed_todos'
      )
    },
    async execute(context: SkillContext): Promise<SkillResult> {
      const startTime = Date.now()
      const retentionDays = (context.params.retentionDays as number) ?? 7
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      const all = await todoRepo.findAll()
      let cleaned = 0
      for (const todo of all) {
        if (todo.completed && todo.updatedAt < cutoff) {
          await todoRepo.delete(todo.id)
          cleaned++
        }
      }

      return {
        success: true,
        output: { cleaned, retentionDays, checked: all.length },
        durationMs: Date.now() - startTime,
      }
    },
  }

  return {
    name: 'data_cleanup',
    description: '清理旧的已完成 Todo 数据，默认保留 7 天',
    category: 'data',
    version: '1.0.0',
    handler,
  }
}

/** 创建健康检查技能 */
export function createHealthCheckSkill(
  todoRepo: IRepository<Todo>,
  cache?: ICacheWithStats<string, unknown> | null,
): RegisterSkillInput {
  const handler: SkillHandler = {
    canHandle(context: SkillContext): boolean {
      return (
        context.params.action === 'health_check' ||
        context.params.action === 'self_test'
      )
    },
    async execute(_context: SkillContext): Promise<SkillResult> {
      const startTime = Date.now()
      const checks: Record<string, boolean> = {}

      // 检查 DB 连接
      try {
        await todoRepo.findAll()
        checks.db_connection = true
      } catch {
        checks.db_connection = false
      }

      // 检查缓存
      if (cache) {
        try {
          const stats = await cache.getStats()
          checks.cache_health = stats.size >= 0
        } catch {
          checks.cache_health = false
        }
      } else {
        checks.cache_health = true
      }

      // 检查 Todo 数据完整性
      try {
        const todos = await todoRepo.findAll()
        checks.todo_integrity = todos.every(
          (t) => typeof t.title === 'string' && t.title.length > 0,
        )
      } catch {
        checks.todo_integrity = false
      }

      const allPassed = Object.values(checks).every((v) => v === true)

      return {
        success: true,
        output: { checks, allPassed },
        durationMs: Date.now() - startTime,
      }
    },
  }

  return {
    name: 'health_check',
    description: '运行系统健康检查（DB、缓存、数据完整性）',
    category: 'monitoring',
    version: '1.0.0',
    handler,
  }
}

/** 创建缓存优化技能 */
export function createCacheOptimizeSkill(
  cache?: ICacheWithStats<string, unknown> | null,
): RegisterSkillInput {
  const handler: SkillHandler = {
    canHandle(context: SkillContext): boolean {
      return (
        context.params.action === 'optimize' ||
        context.params.action === 'clear_cache'
      )
    },
    async execute(_context: SkillContext): Promise<SkillResult> {
      const startTime = Date.now()

      if (!cache) {
        return {
          success: true,
          output: { optimized: false, reason: 'no_cache' },
          durationMs: Date.now() - startTime,
        }
      }

      await cache.clear()
      return {
        success: true,
        output: { optimized: true, action: 'cache_cleared' },
        durationMs: Date.now() - startTime,
      }
    },
  }

  return {
    name: 'cache_optimize',
    description: '清理缓存以优化性能',
    category: 'maintenance',
    version: '1.0.0',
    handler,
  }
}

/** 创建报告生成技能 */
export function createReportSkill(
  todoRepo: IRepository<Todo>,
): RegisterSkillInput {
  const handler: SkillHandler = {
    canHandle(context: SkillContext): boolean {
      return (
        context.params.action === 'report' ||
        context.params.action === 'generate_report'
      )
    },
    async execute(context: SkillContext): Promise<SkillResult> {
      const startTime = Date.now()
      const reportType =
        (context.params.reportType as string) ?? 'system_status'

      const todos = await todoRepo.findAll()
      const completed = todos.filter((t) => t.completed).length
      const pending = todos.length - completed
      const now = new Date()
      const overdue = todos.filter(
        (t) => !t.completed && t.dueDate && t.dueDate < now,
      ).length

      let report: string
      switch (reportType) {
        case 'system_status':
          report = [
            '=== 系统状态报告 ===',
            `时间: ${now.toISOString()}`,
            `Todo 总数: ${todos.length}`,
            `已完成: ${completed} | 待办: ${pending} | 过期: ${overdue}`,
            `完成率: ${todos.length > 0 ? ((completed / todos.length) * 100).toFixed(1) : 0}%`,
          ].join('\n')
          break
        case 'backlog_summary':
          report = [
            '=== 积压摘要报告 ===',
            `待办总数: ${pending}`,
            `过期未完成: ${overdue}`,
            overdue > 10
              ? '⚠ 过期任务过多，需要关注'
              : '✓ 过期任务在可控范围内',
          ].join('\n')
          break
        default:
          report = `未知报告类型: ${reportType}`
      }

      return {
        success: true,
        output: { report, type: reportType, todoCount: todos.length },
        durationMs: Date.now() - startTime,
      }
    },
  }

  return {
    name: 'generate_report',
    description: '生成系统状态或积压摘要报告',
    category: 'communication',
    version: '1.0.0',
    handler,
  }
}

/** 创建趋势分析技能 */
export function createTrendAnalysisSkill(): RegisterSkillInput {
  const handler: SkillHandler = {
    canHandle(context: SkillContext): boolean {
      return (
        context.params.action === 'analyze' ||
        context.params.action === 'trend_analysis'
      )
    },
    async execute(context: SkillContext): Promise<SkillResult> {
      const startTime = Date.now()
      const anomalies = context.observation?.anomalies ?? []
      const learnings = (context.params.recentLearnings as string[]) ?? []

      const analysis: string[] = []
      const patterns: string[] = []

      // 分析异常频率
      const anomalyCounts: Record<string, number> = {}
      for (const a of anomalies) {
        const key = a.split(':')[0].trim()
        anomalyCounts[key] = (anomalyCounts[key] ?? 0) + 1
      }

      for (const [key, count] of Object.entries(anomalyCounts)) {
        if (count > 1) {
          patterns.push(`异常"${key}"出现 ${count} 次，可能是反复出现的问题`)
        }
      }

      // 分析学习趋势
      if (learnings.length > 3) {
        analysis.push(
          `近期积累了 ${learnings.length} 条学习记录，建议应用到决策规则`,
        )
      }

      analysis.push(`当前检测到 ${anomalies.length} 个异常`)
      if (patterns.length > 0) {
        analysis.push(`识别到 ${patterns.length} 个重复模式`)
      }

      return {
        success: true,
        output: {
          analysis: analysis.join('\n'),
          patterns,
          anomalyCount: anomalies.length,
          learningCount: learnings.length,
        },
        durationMs: Date.now() - startTime,
      }
    },
  }

  return {
    name: 'trend_analysis',
    description: '分析异常趋势和学习模式',
    category: 'analysis',
    version: '1.0.0',
    handler,
  }
}

/**
 * 注册所有内置技能到技能注册表
 */
export async function registerBuiltinSkills(
  registry: import('../agent.interface.js').ISkillRegistry,
  logger: Logger,
  todoRepo: IRepository<Todo>,
  cache?: ICacheWithStats<string, unknown> | null,
): Promise<void> {
  const skills: RegisterSkillInput[] = [
    createDataCleanupSkill(todoRepo),
    createHealthCheckSkill(todoRepo, cache),
    createCacheOptimizeSkill(cache),
    createReportSkill(todoRepo),
    createTrendAnalysisSkill(),
  ]

  for (const skill of skills) {
    await registry.register(skill)
  }

  logger.info('Built-in skills registered', { count: skills.length })
}
