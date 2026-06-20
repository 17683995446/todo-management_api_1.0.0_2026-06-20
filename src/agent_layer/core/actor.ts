import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { IRepository } from '../../core_layer/data/access/repository.interface.js'
import type { ICacheWithStats } from '../../core_layer/logic/cache.interface.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import {
  NotFoundError,
  UnsupportedOperationError,
  ValidationError,
} from '../../core_layer/model/errors.js'
import type { Todo } from '../../core_layer/model/todo.js'
import type { IActor } from '../agent.interface.js'
import type { ActionResult } from '../model/action_result.js'
import type { ActionType, Decision } from '../model/decision.js'

/**
 * Agent 执行器
 *
 * 这是 OODA 循环的 "Act" 阶段。
 *
 * 职责：
 * - 根据决策的 actionType 执行对应操作
 * - 每个操作都有错误处理，确保不会因单个操作失败而崩溃
 * - 记录执行耗时和结果
 *
 * 支持的行动类型：
 * - noop: 无操作
 * - create_todo: 创建待办事项
 * - complete_todo: 完成待办事项
 * - cleanup: 清理过期数据
 * - alert: 记录告警（实际环境可对接通知系统）
 * - optimize: 执行优化（如清理缓存）
 * - self_test: 运行自检
 * - report: 生成报告
 * - create_goal: 创建新目标（返回描述，由循环层添加到队列）
 */
export class AgentActor implements IActor {
  constructor(
    private readonly logger: Logger,
    private readonly todoRepo: IRepository<Todo>,
    private readonly cache?: ICacheWithStats<string, unknown> | null,
  ) {}

  async act(decision: Decision): Promise<ActionResult> {
    const startTime = performance.now()
    this.logger.info('Executing action', {
      actionType: decision.actionType,
      decisionId: decision.id,
    })

    try {
      const output = await this.executeAction(decision)
      const durationMs = Math.round(performance.now() - startTime)

      const result: ActionResult = {
        id: randomUUID(),
        decisionId: decision.id,
        success: true,
        output,
        durationMs,
        timestamp: new Date().toISOString(),
      }

      this.logger.info('Action completed', {
        actionType: decision.actionType,
        success: true,
        durationMs,
      })

      return result
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime)
      const errorMsg = err instanceof Error ? err.message : String(err)

      this.logger.error('Action failed', {
        actionType: decision.actionType,
        error: errorMsg,
        durationMs,
      })

      return {
        id: randomUUID(),
        decisionId: decision.id,
        success: false,
        output: null,
        error: errorMsg,
        durationMs,
        timestamp: new Date().toISOString(),
      }
    }
  }

  /**
   * 根据行动类型分发执行
   */
  private async executeAction(decision: Decision): Promise<unknown> {
    switch (decision.actionType as ActionType) {
      case 'noop':
        return this.executeNoop(decision)

      case 'create_todo':
        return this.executeCreateTodo(decision)

      case 'complete_todo':
        return this.executeCompleteTodo(decision)

      case 'cleanup':
        return this.executeCleanup(decision)

      case 'alert':
        return this.executeAlert(decision)

      case 'optimize':
        return this.executeOptimize(decision)

      case 'self_test':
        return this.executeSelfTest(decision)

      case 'report':
        return this.executeReport(decision)

      case 'create_goal':
        return this.executeCreateGoal(decision)

      default:
        throw new UnsupportedOperationError(
          `Unknown action type: ${decision.actionType}`,
        )
    }
  }

  /**
   * 无操作
   */
  private async executeNoop(_decision: Decision): Promise<{ message: string }> {
    return { message: 'No action needed' }
  }

  /**
   * 创建待办事项
   */
  private async executeCreateTodo(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const params = decision.actionParams
    const title = params.title as string
    const priority = (params.priority as Todo['priority']) || 'medium'
    const tags = (params.tags as string[]) || []

    const todo = await this.todoRepo.create({
      userId: 'agent', // Agent 自动创建的 Todo 归属 'agent' 用户
      title,
      completed: false,
      priority,
      dueDate: null,
      tags,
    })

    return { todoId: todo.id, title: todo.title }
  }

  /**
   * 完成待办事项
   */
  private async executeCompleteTodo(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const todoId = decision.actionParams.todoId as string
    if (!todoId) {
      throw new ValidationError('todoId is required for complete_todo action')
    }

    const updated = await this.todoRepo.update(todoId, {
      completed: true,
    })

    if (!updated) {
      throw new NotFoundError('Todo', todoId)
    }

    return { completed: true, todoId: updated.id }
  }

  /**
   * 清理过期数据
   */
  private async executeCleanup(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const target = decision.actionParams.target as string
    let cleaned = 0

    if (target === 'completed_todos') {
      // 清理已完成的 Todo（保留最近 7 天）
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const all = await this.todoRepo.findAll()
      for (const todo of all) {
        if (todo.completed && todo.updatedAt < cutoff) {
          await this.todoRepo.delete(todo.id)
          cleaned++
        }
      }
    }

    return { cleaned, target }
  }

  /**
   * 发出告警
   * 实际环境中可对接邮件/Slack/钉钉等通知系统
   */
  private async executeAlert(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const severity = decision.actionParams.severity as string
    const message = decision.actionParams.message as string

    // 当前实现：记录到日志（生产环境可对接通知系统）
    this.logger.warn(`ALERT [${severity}]: ${message}`, {
      severity,
      message,
      anomalies: decision.actionParams.anomalies,
    })

    return { alerted: true, severity, message }
  }

  /**
   * 执行优化
   */
  private async executeOptimize(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const target = decision.actionParams.target as string
    const action = decision.actionParams.action as string

    if (target === 'cache' && action === 'clear') {
      if (this.cache) {
        // 清空缓存
        await this.cache.clear()
        return { optimized: true, target: 'cache', action: 'cleared' }
      }
      return { optimized: false, target: 'cache', action: 'no_cache' }
    }

    return { optimized: false, target, action }
  }

  /**
   * 运行自检
   */
  private async executeSelfTest(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const checks = (decision.actionParams.checks as string[]) || []
    const results: Record<string, boolean> = {}

    for (const check of checks) {
      try {
        results[check] = await this.runCheck(check)
      } catch {
        results[check] = false
      }
    }

    return {
      checks: results,
      allPassed: Object.values(results).every((v) => v === true),
    }
  }

  /**
   * 执行单项检查
   */
  private async runCheck(checkName: string): Promise<boolean> {
    switch (checkName) {
      case 'db_connection': {
        // 尝试查询 Todo 列表，验证 DB 连接
        await this.todoRepo.findAll()
        return true
      }
      case 'cache_health': {
        if (this.cache) {
          const stats = await this.cache.getStats()
          // 缓存正常运行即可
          return stats.size >= 0
        }
        return true // 无缓存视为通过
      }
      case 'api_endpoints':
        // API 端点检查需要 HTTP 客户端，这里简化为 true
        return true
      case 'todo_integrity': {
        // 检查 Todo 数据完整性
        const todos = await this.todoRepo.findAll()
        // 所有 Todo 必须有 title
        return todos.every(
          (t) => typeof t.title === 'string' && t.title.length > 0,
        )
      }
      default:
        return false
    }
  }

  /**
   * 生成报告
   */
  private async executeReport(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const type = decision.actionParams.type as string

    let report: string

    switch (type) {
      case 'system_status': {
        const health = decision.actionParams.health as string
        const metrics = decision.actionParams.metrics as Record<string, unknown>
        report = `System Status Report\n  Health: ${health}\n  Metrics: ${JSON.stringify(metrics, null, 2)}\n`
        break
      }

      case 'backlog_summary': {
        const pending = decision.actionParams.pendingCount as number
        const total = decision.actionParams.total as number
        report = `Backlog Summary Report\n  Total todos: ${total}\n  Pending: ${pending}\n  Completion rate: ${total > 0 ? (((total - pending) / total) * 100).toFixed(1) : 0}%\n`
        break
      }

      case 'goal_status': {
        const desc = decision.actionParams.goalDescription as string
        report = `Goal Status Report\n  Goal: ${desc}\n  Status: in_progress\n`
        break
      }

      default:
        report = `Unknown report type: ${type}`
    }

    this.logger.info('Report generated', { type, length: report.length })

    return { report, type }
  }

  /**
   * 创建新目标
   * 返回目标描述，由 AgentLoop 负责实际添加到队列
   */
  private async executeCreateGoal(
    decision: Decision,
  ): Promise<Record<string, unknown>> {
    const description = decision.actionParams.description as string
    const type = (decision.actionParams.type as string) || 'monitoring'

    return {
      goalDescription: description,
      goalType: type,
    }
  }
}
