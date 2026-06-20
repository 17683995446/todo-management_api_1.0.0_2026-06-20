import { randomUUID } from 'node:crypto'
import type { Logger } from '../../core_layer/logic/logger.js'
import type { IReflector } from '../agent.interface.js'
import type { ActionResult } from '../model/action_result.js'
import type { Decision } from '../model/decision.js'
import type { Observation } from '../model/observation.js'
import type { Reflection, ReflectionOutcome } from '../model/reflection.js'

/**
 * Agent 反思器
 *
 * 这是 OODA 循环的 "Reflect" 阶段，也是自驱闭环的关键。
 *
 * 职责：
 * 1. 评估行动结果（success / partial / failure）
 * 2. 提取经验教训（learnings）
 * 3. 基于结果生成新目标描述（newGoalDescriptions）
 *
 * 反思规则：
 * - 成功 + 有异常未解决 → 生成后续修复目标
 * - 成功 + 无异常 → 生成定期监控目标
 * - 部分成功 → 生成诊断目标
 * - 失败 → 生成重试或升级目标
 * - 自检失败 → 生成修复目标
 * - 告警发出 → 生成跟踪目标
 */
export class AgentReflector implements IReflector {
  constructor(private readonly logger: Logger) {}

  async reflect(
    actionResult: ActionResult,
    decision: Decision,
    observation: Observation,
  ): Promise<Reflection> {
    this.logger.debug('Reflecting on action result...', {
      success: actionResult.success,
      actionType: decision.actionType,
      durationMs: actionResult.durationMs,
    })

    const outcome = this.evaluateOutcome(actionResult, decision)
    const learnings = this.extractLearnings(
      actionResult,
      decision,
      observation,
      outcome,
    )
    const newGoalDescriptions = this.generateNewGoals(
      actionResult,
      decision,
      observation,
      outcome,
    )

    const reflection: Reflection = {
      id: randomUUID(),
      actionResultId: actionResult.id,
      outcome,
      learnings,
      newGoalDescriptions,
      timestamp: new Date().toISOString(),
    }

    this.logger.info('Reflection completed', {
      outcome,
      learningsCount: learnings.length,
      newGoalsCount: newGoalDescriptions.length,
    })

    return reflection
  }

  /**
   * 评估行动结果
   */
  private evaluateOutcome(
    result: ActionResult,
    decision: Decision,
  ): ReflectionOutcome {
    // 明确失败
    if (!result.success) {
      return 'failure'
    }

    // 自检部分通过
    if (decision.actionType === 'self_test') {
      const output = result.output as {
        checks?: Record<string, boolean>
        allPassed?: boolean
      }
      if (output.allPassed === false) {
        return 'partial'
      }
    }

    // 优化未生效
    if (decision.actionType === 'optimize') {
      const output = result.output as { optimized?: boolean }
      if (output.optimized === false) {
        return 'partial'
      }
    }

    return 'success'
  }

  /**
   * 提取经验教训
   */
  private extractLearnings(
    result: ActionResult,
    decision: Decision,
    observation: Observation,
    outcome: ReflectionOutcome,
  ): string[] {
    const learnings: string[] = []

    // 基于结果的学习
    if (outcome === 'failure') {
      learnings.push(
        `Action ${decision.actionType} failed with error: ${result.error || 'unknown'}`,
      )
      learnings.push(
        'Consider alternative approaches or escalate to manual intervention',
      )
    } else if (outcome === 'partial') {
      learnings.push(
        `Action ${decision.actionType} partially succeeded, some checks failed`,
      )
      learnings.push(
        'Investigate failed checks and schedule targeted maintenance',
      )
    } else {
      learnings.push(
        `Action ${decision.actionType} completed successfully in ${result.durationMs}ms`,
      )
    }

    // 基于行动类型的学习
    switch (decision.actionType) {
      case 'self_test': {
        const output = result.output as { checks?: Record<string, boolean> }
        if (output.checks) {
          for (const [check, passed] of Object.entries(output.checks)) {
            if (!passed) {
              learnings.push(
                `Self-test check '${check}' failed, needs attention`,
              )
            }
          }
        }
        break
      }
      case 'optimize': {
        const output = result.output as { optimized?: boolean }
        if (output.optimized) {
          learnings.push(
            'Cache cleared successfully, response times should improve',
          )
        }
        break
      }
      case 'create_todo': {
        learnings.push('Auto-created todo for tracking, monitor for completion')
        break
      }
      case 'alert': {
        learnings.push('Alert was issued, monitor for resolution')
        break
      }
    }

    // 基于异常的学习
    if (observation.anomalies.length > 0 && outcome === 'success') {
      const unresolved = observation.anomalies.filter(
        (a) => !a.includes(decision.reasoning),
      )
      if (unresolved.length > 0) {
        learnings.push(
          `${unresolved.length} anomalies remain unresolved after action`,
        )
      }
    }

    // 基于耗时的学习
    if (result.durationMs > 5000) {
      learnings.push(
        `Action took ${result.durationMs}ms, consider optimizing this operation`,
      )
    }

    return learnings
  }

  /**
   * 基于反思生成新目标描述
   */
  private generateNewGoals(
    result: ActionResult,
    decision: Decision,
    observation: Observation,
    outcome: ReflectionOutcome,
  ): string[] {
    const newGoals: string[] = []

    // 失败 → 生成重试或诊断目标
    if (outcome === 'failure') {
      // 如果是自检失败，生成修复目标
      if (decision.actionType === 'self_test') {
        newGoals.push('Diagnose and fix failed self-test checks')
      } else {
        newGoals.push(
          `Retry failed ${decision.actionType} action with adjusted parameters`,
        )
      }
      // 多次失败 → 升级
      newGoals.push(
        'Escalate persistent failures to manual review if retries exceed limit',
      )
    }

    // 部分成功 → 生成诊断目标
    if (outcome === 'partial') {
      if (decision.actionType === 'self_test') {
        const output = result.output as { checks?: Record<string, boolean> }
        const failedChecks = output.checks
          ? Object.entries(output.checks)
              .filter(([, v]) => !v)
              .map(([k]) => k)
          : []
        if (failedChecks.length > 0) {
          newGoals.push(`Fix failed checks: ${failedChecks.join(', ')}`)
        }
      }
      if (decision.actionType === 'optimize') {
        newGoals.push('Investigate why optimization did not take effect')
      }
    }

    // 成功但有未解决异常 → 生成后续目标
    if (outcome === 'success' && observation.anomalies.length > 0) {
      // 检查当前行动是否解决了某些异常
      const remainingAnomalies = observation.anomalies.filter((a) => {
        // 如果行动是针对该异常的，认为已处理
        if (decision.actionType === 'alert' && a.includes('Rate limit'))
          return false
        if (decision.actionType === 'optimize' && a.includes('Slow response'))
          return false
        if (decision.actionType === 'create_todo' && a.includes('overdue'))
          return false
        if (decision.actionType === 'report' && a.includes('backlog'))
          return false
        return true
      })

      if (remainingAnomalies.length > 0) {
        newGoals.push(
          `Address remaining anomalies: ${remainingAnomalies.slice(0, 3).join('; ')}`,
        )
      }
    }

    // 成功且无异常 → 生成定期监控目标（低优先级）
    if (outcome === 'success' && observation.anomalies.length === 0) {
      // 只在特定行动后生成监控目标，避免过于频繁
      if (
        decision.actionType === 'self_test' &&
        decision.actionParams.periodic === true
      ) {
        newGoals.push('Continue periodic monitoring to detect issues early')
      }
    }

    // 告警后 → 生成跟踪目标
    if (decision.actionType === 'alert' && outcome === 'success') {
      newGoals.push('Track alert resolution and verify system recovery')
    }

    // 创建 Todo 后 → 生成跟踪目标
    if (decision.actionType === 'create_todo' && outcome === 'success') {
      newGoals.push('Monitor auto-created todo for timely completion')
    }

    return newGoals
  }
}
