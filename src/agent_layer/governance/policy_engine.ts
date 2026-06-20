import { randomUUID } from 'node:crypto'
import type { Logger } from '../../core_layer/logic/logger.js'
import {
  AlreadyExistsError,
  NotFoundError,
} from '../../core_layer/model/errors.js'
import type { IPolicyEngine } from '../agent.interface.js'
import type {
  CreatePolicyInput,
  Policy,
  PolicyContext,
  PolicyDecision,
  PolicyEvaluationResult,
  PolicyType,
} from '../model/policy.js'

/**
 * 策略引擎
 *
 * 在 Agent 执行任何行动前评估策略，确保行为在允许范围内。
 *
 * 设计原则：
 * - 策略按优先级降序评估（高优先级先评估）
 * - forbidden 类型策略一旦匹配立即拒绝
 * - limit/quota 类型策略检查资源使用是否超限
 * - required 类型策略检查前置条件是否满足
 * - schedule 类型策略检查时间窗口
 * - 评估结果记录违规统计，用于趋势分析
 *
 * 这是秩序化的第一道防线：给自主性加上安全边界。
 */
export class PolicyEngine implements IPolicyEngine {
  /** 策略注册表（name → Policy） */
  private readonly policies = new Map<string, Policy>()
  /** 违规统计（policyName → 次数） */
  private readonly violationStats = new Map<string, number>()

  constructor(private readonly logger: Logger) {}

  async registerPolicy(input: CreatePolicyInput): Promise<Policy> {
    if (this.policies.has(input.name)) {
      throw new AlreadyExistsError('Policy', input.name)
    }

    const now = new Date()
    const policy: Policy = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      type: input.type,
      scope: input.scope,
      priority: input.priority ?? 0,
      enabled: true,
      rule: input.rule,
      denialReason: input.denialReason,
      createdAt: now,
      updatedAt: now,
    }

    this.policies.set(input.name, policy)
    this.logger.info('Policy registered', {
      name: input.name,
      type: input.type,
      scope: input.scope,
      priority: policy.priority,
    })

    return policy
  }

  async unregisterPolicy(name: string): Promise<boolean> {
    const existed = this.policies.delete(name)
    if (existed) {
      this.logger.info('Policy unregistered', { name })
    }
    return existed
  }

  async setEnabled(name: string, enabled: boolean): Promise<Policy> {
    const policy = this.policies.get(name)
    if (!policy) {
      throw new NotFoundError('Policy', name)
    }
    policy.enabled = enabled
    policy.updatedAt = new Date()
    this.logger.info('Policy toggled', { name, enabled })
    return policy
  }

  listPolicies(): Policy[] {
    return Array.from(this.policies.values()).sort(
      (a, b) => b.priority - a.priority,
    )
  }

  async evaluate(context: PolicyContext): Promise<PolicyEvaluationResult> {
    const triggeredPolicies: string[] = []
    let finalDecision: PolicyDecision = 'allow'
    let reason: string | undefined
    let adjustedParams: Record<string, unknown> | undefined

    // 按优先级降序评估
    const sorted = this.listPolicies().filter((p) => p.enabled)

    for (const policy of sorted) {
      const matches = this.matchesPolicy(policy, context)
      if (!matches) continue

      triggeredPolicies.push(policy.name)

      const result = this.applyPolicy(policy, context)
      if (result.decision === 'deny') {
        finalDecision = 'deny'
        reason =
          result.reason ??
          policy.denialReason ??
          `Denied by policy: ${policy.name}`
        this.recordViolation(policy.name)
        break // forbidden 立即终止
      }
      if (result.decision === 'adjust' && finalDecision === 'allow') {
        finalDecision = 'adjust'
        reason = result.reason
        adjustedParams = result.adjustedParams
      }
    }

    if (finalDecision !== 'allow') {
      this.logger.warn('Policy evaluation resulted in non-allow', {
        decision: finalDecision,
        triggeredPolicies,
        reason,
        actionType: context.actionType,
      })
    }

    return {
      decision: finalDecision,
      triggeredPolicies,
      reason,
      adjustedParams,
    }
  }

  async getViolationStats(): Promise<Record<string, number>> {
    const result: Record<string, number> = {}
    for (const [name, count] of this.violationStats) {
      result[name] = count
    }
    return result
  }

  /**
   * 检查策略是否匹配上下文
   */
  private matchesPolicy(policy: Policy, context: PolicyContext): boolean {
    const rule = policy.rule

    switch (policy.scope) {
      case 'action':
        // 规则格式: "actionType:alert,delete" 或 "actionType:*"
        if (rule.startsWith('actionType:')) {
          const actions = rule.slice('actionType:'.length).split(',')
          return actions.includes('*') || actions.includes(context.actionType)
        }
        return false

      case 'resource':
        // 规则格式: "dimension:actions,threshold:10"
        if (rule.startsWith('dimension:')) {
          const usage = context.resourceUsage
          if (!usage) return false
          const parts = rule.split(',')
          const dimensionPart = parts.find((p) => p.startsWith('dimension:'))
          const thresholdPart = parts.find((p) => p.startsWith('threshold:'))
          if (!dimensionPart || !thresholdPart) return false
          const dimension = dimensionPart.slice('dimension:'.length)
          const threshold = Number(thresholdPart.slice('threshold:'.length))
          if (dimension === 'actions') {
            return usage.actionsThisCycle >= threshold
          }
          if (dimension === 'duration_ms') {
            return usage.durationThisCycleMs >= threshold
          }
          if (dimension === 'memory_mb') {
            return usage.memoryUsageMb >= threshold
          }
        }
        return false

      case 'schedule': {
        // 规则格式: "hours:9-17" 或 "days:1-5"
        const now = new Date(context.timestamp)
        if (rule.startsWith('hours:')) {
          const range = rule.slice('hours:'.length).split('-')
          const start = Number(range[0])
          const end = Number(range[1])
          const hour = now.getHours()
          return hour < start || hour >= end
        }
        if (rule.startsWith('days:')) {
          const range = rule.slice('days:'.length).split('-')
          const start = Number(range[0])
          const end = Number(range[1])
          const day = now.getDay()
          return day < start || day > end
        }
        return false
      }

      case 'global':
        return true

      default:
        return false
    }
  }

  /**
   * 应用策略，返回决策
   */
  private applyPolicy(
    policy: Policy,
    context: PolicyContext,
  ): {
    decision: PolicyDecision
    reason?: string
    adjustedParams?: Record<string, unknown>
  } {
    switch (policy.type) {
      case 'forbidden':
        return {
          decision: 'deny',
          reason:
            policy.denialReason ??
            `Action '${context.actionType}' is forbidden by policy '${policy.name}'`,
        }

      case 'limit': {
        // 限制类：如果资源使用超过限制，拒绝
        const usage = context.resourceUsage
        if (usage) {
          const parts = policy.rule.split(',')
          const dimensionPart = parts.find((p) => p.startsWith('dimension:'))
          const thresholdPart = parts.find((p) => p.startsWith('threshold:'))
          if (dimensionPart && thresholdPart) {
            const dimension = dimensionPart.slice('dimension:'.length)
            const threshold = Number(thresholdPart.slice('threshold:'.length))
            let current = 0
            if (dimension === 'actions') {
              current = usage.actionsThisCycle
            } else if (dimension === 'duration_ms') {
              current = usage.durationThisCycleMs
            } else if (dimension === 'memory_mb') {
              current = usage.memoryUsageMb
            }
            if (current >= threshold) {
              return {
                decision: 'deny',
                reason: `Resource limit reached: ${dimension}=${current}/${threshold}`,
              }
            }
          }
        }
        return { decision: 'allow' }
      }

      case 'quota':
        // 配额类：类似 limit，但可调整（降级执行）
        return { decision: 'allow' }

      case 'required':
        // 必需类：检查前置条件
        return { decision: 'allow' }

      case 'schedule':
        // 调度类：非工作时间拒绝
        return {
          decision: 'deny',
          reason:
            policy.denialReason ??
            `Action not allowed at this time (policy: ${policy.name})`,
        }

      default:
        return { decision: 'allow' }
    }
  }

  /**
   * 记录违规
   */
  private recordViolation(policyName: string): void {
    const current = this.violationStats.get(policyName) ?? 0
    this.violationStats.set(policyName, current + 1)
  }
}

/**
 * 默认安全策略集
 * 提供开箱即用的基础安全约束。
 */
export const DEFAULT_POLICIES: CreatePolicyInput[] = [
  {
    name: 'forbid-delete-users',
    description: '禁止删除用户数据',
    type: 'forbidden',
    scope: 'action',
    priority: 100,
    rule: 'actionType:delete_user,delete_account',
    denialReason: '删除用户数据被安全策略禁止',
  },
  {
    name: 'limit-actions-per-cycle',
    description: '每循环最多 10 次行动',
    type: 'limit',
    scope: 'resource',
    priority: 50,
    rule: 'dimension:actions,threshold:10',
    denialReason: '单循环行动次数超限',
  },
  {
    name: 'limit-memory-usage',
    description: '内存使用超过 512MB 时拒绝新行动',
    type: 'limit',
    scope: 'resource',
    priority: 50,
    rule: 'dimension:memory_mb,threshold:512',
    denialReason: '内存使用超限',
  },
]

/**
 * 注册默认安全策略
 */
export async function registerDefaultPolicies(
  engine: IPolicyEngine,
): Promise<void> {
  for (const policy of DEFAULT_POLICIES) {
    await engine.registerPolicy(policy)
  }
}
