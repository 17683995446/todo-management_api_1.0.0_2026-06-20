import { randomUUID } from 'node:crypto'
import type { Logger } from '../../core_layer/logic/logger.js'
import { ValidationError } from '../../core_layer/model/errors.js'
import type { IDecisionEngine } from '../agent.interface.js'
import type { ActionType, Decision } from '../model/decision.js'
import type { Goal } from '../model/goal.js'
import type { Observation } from '../model/observation.js'

/**
 * 决策规则
 * 每条规则包含一个匹配条件和对应的行动生成函数。
 */
interface DecisionRule {
  /** 规则名称 */
  name: string
  /** 规则优先级（数字越小越先评估） */
  priority: number
  /** 匹配条件：返回 true 表示此规则适用 */
  matches(observation: Observation, currentGoal?: Goal | null): boolean
  /** 生成决策（observationId/goalId/id/createdAt 由主方法填充） */
  decide(
    observation: Observation,
    currentGoal?: Goal | null,
  ): Omit<Decision, 'id' | 'createdAt' | 'observationId' | 'goalId'>
}

/**
 * 规则驱动的决策引擎
 *
 * 这是 OODA 循环的 "Orient + Decide" 阶段。
 *
 * 决策逻辑：
 * 1. 如果有当前目标，优先为该目标生成行动
 * 2. 如果无目标但有异常，基于异常生成修复行动
 * 3. 如果无异常，执行定期维护行动
 * 4. 默认返回 noop
 *
 * 规则按优先级排序，第一个匹配的规则胜出。
 */
export class RuleBasedDecisionEngine implements IDecisionEngine {
  /** 决策规则列表，按 priority 升序排列 */
  private readonly rules: DecisionRule[]

  constructor(private readonly logger: Logger) {
    this.rules = this.buildRules().sort((a, b) => a.priority - b.priority)
  }

  async decide(
    observation: Observation,
    currentGoal?: Goal | null,
  ): Promise<Decision> {
    this.logger.debug('Deciding action...', {
      anomalies: observation.anomalies.length,
      hasGoal: !!currentGoal,
    })

    // 按优先级遍历规则，第一个匹配的胜出
    for (const rule of this.rules) {
      if (rule.matches(observation, currentGoal)) {
        const partial = rule.decide(observation, currentGoal)
        const decision: Decision = {
          ...partial,
          id: randomUUID(),
          observationId: observation.id,
          goalId: currentGoal?.id,
          createdAt: new Date().toISOString(),
        }

        this.logger.info('Decision made', {
          rule: rule.name,
          action: decision.actionType,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
        })

        return decision
      }
    }

    // 默认：无操作
    return {
      id: randomUUID(),
      observationId: observation.id,
      goalId: currentGoal?.id,
      actionType: 'noop' as ActionType,
      actionParams: {},
      reasoning: 'No rule matched, no action needed',
      confidence: 1.0,
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * 构建决策规则集
   */
  private buildRules(): DecisionRule[] {
    return [
      // 规则 1：系统不健康 → 紧急告警
      {
        name: 'system-unhealthy',
        priority: 1,
        matches: (obs) => obs.systemHealth.status === 'unhealthy',
        decide: (obs) => ({
          actionType: 'alert' as ActionType,
          actionParams: {
            severity: 'critical',
            message: `System unhealthy: DB connected=${obs.systemHealth.dbConnected}`,
            anomalies: obs.anomalies,
          },
          reasoning: 'System is unhealthy, immediate alert required',
          confidence: 1.0,
        }),
      },

      // 规则 2：有当前目标 → 为目标生成行动
      {
        name: 'goal-driven',
        priority: 2,
        matches: (_obs, goal) => !!goal && goal.status === 'in_progress',
        decide: (obs, goal) => {
          if (!goal) {
            throw new ValidationError(
              'Goal is required for goal-driven decision',
            )
          }
          return this.decideForGoal(obs, goal)
        },
      },

      // 规则 3：高错误率 → 自检
      {
        name: 'high-error-rate',
        priority: 3,
        matches: (obs) =>
          obs.anomalies.some((a) => a.includes('High error rate')),
        decide: (obs) => ({
          actionType: 'self_test' as ActionType,
          actionParams: {
            checks: ['db_connection', 'cache_health', 'api_endpoints'],
            errorRate: obs.metrics.errorRate,
          },
          reasoning: `Error rate is ${(obs.metrics.errorRate * 100).toFixed(1)}%, running self-test to diagnose`,
          confidence: 0.8,
        }),
      },

      // 规则 4：响应慢 → 优化（清理缓存）
      {
        name: 'slow-response',
        priority: 4,
        matches: (obs) =>
          obs.anomalies.some((a) => a.includes('Slow response time')),
        decide: (obs) => ({
          actionType: 'optimize' as ActionType,
          actionParams: {
            target: 'cache',
            action: 'clear',
            avgResponseTimeMs: obs.metrics.avgResponseTimeMs,
          },
          reasoning: `Avg response time ${obs.metrics.avgResponseTimeMs}ms is slow, clearing cache to refresh`,
          confidence: 0.6,
        }),
      },

      // 规则 5：过期 Todo 过多 → 创建清理目标
      {
        name: 'overdue-todos',
        priority: 5,
        matches: (obs) =>
          obs.anomalies.some((a) => a.includes('overdue todos')),
        decide: (obs) => ({
          actionType: 'create_todo' as ActionType,
          actionParams: {
            title: `Review ${obs.todoStats.overdue} overdue todos`,
            priority: 'high',
            tags: ['auto-generated', 'maintenance'],
          },
          reasoning: `${obs.todoStats.overdue} overdue todos detected, creating a task to review them`,
          confidence: 0.7,
        }),
      },

      // 规则 6：积压过多 → 创建报告
      {
        name: 'backlog-alert',
        priority: 6,
        matches: (obs) => obs.anomalies.some((a) => a.includes('backlog')),
        decide: (obs) => ({
          actionType: 'report' as ActionType,
          actionParams: {
            type: 'backlog_summary',
            pendingCount: obs.todoStats.pending,
            total: obs.todoStats.total,
          },
          reasoning: `${obs.todoStats.pending} pending todos indicate backlog, generating report`,
          confidence: 0.7,
        }),
      },

      // 规则 7：限流频繁 → 告警
      {
        name: 'rate-limit-frequent',
        priority: 7,
        matches: (obs) => obs.anomalies.some((a) => a.includes('Rate limit')),
        decide: (obs) => ({
          actionType: 'alert' as ActionType,
          actionParams: {
            severity: 'warning',
            message: `Rate limit triggered ${obs.metrics.rateLimitHits} times`,
            rateLimitHits: obs.metrics.rateLimitHits,
          },
          reasoning:
            'Rate limit being hit frequently, may indicate abuse or misconfigured clients',
          confidence: 0.6,
        }),
      },

      // 规则 8：系统健康且无异常 → 定期自检（低置信度）
      {
        name: 'periodic-self-test',
        priority: 100,
        matches: (obs) =>
          obs.systemHealth.status === 'healthy' && obs.anomalies.length === 0,
        decide: () => ({
          actionType: 'self_test' as ActionType,
          actionParams: {
            checks: ['db_connection'],
            periodic: true,
          },
          reasoning:
            'System healthy, running periodic self-test for early detection',
          confidence: 0.3,
        }),
      },
    ]
  }

  /**
   * 为特定目标生成决策
   */
  private decideForGoal(
    observation: Observation,
    goal: Goal,
  ): Omit<Decision, 'id' | 'createdAt' | 'observationId' | 'goalId'> {
    switch (goal.type) {
      case 'maintenance':
        return {
          actionType: 'self_test' as ActionType,
          actionParams: {
            checks: ['db_connection', 'cache_health', 'todo_integrity'],
            goalId: goal.id,
          },
          reasoning: `Maintenance goal: ${goal.description}`,
          confidence: 0.8,
        }

      case 'optimization':
        return {
          actionType: 'optimize' as ActionType,
          actionParams: {
            target: 'cache',
            action: 'clear',
            goalId: goal.id,
          },
          reasoning: `Optimization goal: ${goal.description}`,
          confidence: 0.7,
        }

      case 'monitoring':
        return {
          actionType: 'report' as ActionType,
          actionParams: {
            type: 'system_status',
            health: observation.systemHealth.status,
            metrics: observation.metrics,
            goalId: goal.id,
          },
          reasoning: `Monitoring goal: ${goal.description}`,
          confidence: 0.9,
        }

      case 'self_improvement':
        return {
          actionType: 'create_goal' as ActionType,
          actionParams: {
            description: 'Self-improvement: analyze recent performance',
            type: 'monitoring',
            goalId: goal.id,
          },
          reasoning: `Self-improvement goal: ${goal.description}`,
          confidence: 0.5,
        }

      default:
        return {
          actionType: 'report' as ActionType,
          actionParams: {
            type: 'goal_status',
            goalId: goal.id,
            goalDescription: goal.description,
          },
          reasoning: `User-defined goal: ${goal.description}`,
          confidence: 0.6,
        }
    }
  }
}
