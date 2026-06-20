import type { SqliteRepository } from '../../core_layer/data/access/sqlite_repository.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import { NotFoundError } from '../../core_layer/model/errors.js'
import type { ILearningEngine } from '../agent.interface.js'
import type { Decision } from '../model/decision.js'
import type {
  CreateLearningInput,
  Learning,
  LearningStats,
  LearningType,
} from '../model/learning.js'
import type { Reflection } from '../model/reflection.js'

/**
 * 学习引擎
 *
 * 从反思中提取可复用的模式和经验，累积为知识库。
 *
 * 设计原则：
 * - 学习记录持久化到 SQLite，跨循环累积
 * - 相同模式多次出现时，递增 occurrences 和 confidence
 * - 学习可建议规则更新，实现决策引擎的自我进化
 * - 学习可标记为"已应用"，避免重复应用
 *
 * 这是 Agent "自主学会增强自己的技能"的关键：
 * Agent 从每次行动的结果中学习，逐步优化决策规则。
 */
export class LearningEngine implements ILearningEngine {
  constructor(
    private readonly logger: Logger,
    private readonly repo: SqliteRepository<Learning>,
  ) {}

  async learn(input: CreateLearningInput): Promise<Learning> {
    // 检查是否已有相同模式的学习记录
    const all = await this.repo.findAll()
    const existing = all.find(
      (l) => l.pattern === input.pattern && l.type === input.type,
    )

    if (existing) {
      // 已存在：递增 occurrences，提升 confidence
      const newOccurrences = existing.occurrences + 1
      const newConfidence = Math.min(1.0, existing.confidence + 0.1)
      const updated = await this.repo.update(existing.id, {
        occurrences: newOccurrences,
        confidence: newConfidence,
      })
      this.logger.info('Learning reinforced', {
        id: existing.id,
        pattern: input.pattern,
        occurrences: newOccurrences,
        confidence: newConfidence,
      })
      return updated ?? existing
    }

    // 新学习记录
    const created = await this.repo.create({
      type: input.type,
      pattern: input.pattern,
      context: input.context,
      confidence: 0.5,
      occurrences: 1,
      sourceAction: input.sourceAction,
      suggestedRuleUpdate: input.suggestedRuleUpdate,
      applied: false,
      appliedAt: undefined,
    })

    this.logger.info('New learning recorded', {
      id: created.id,
      type: input.type,
      pattern: input.pattern,
    })

    return created
  }

  async findAll(): Promise<Learning[]> {
    return this.repo.findAll()
  }

  async findUnapplied(): Promise<Learning[]> {
    const all = await this.repo.findAll()
    return all.filter((l) => !l.applied)
  }

  async stats(): Promise<LearningStats> {
    const all = await this.repo.findAll()
    const byType: Record<LearningType, number> = {
      pattern: 0,
      rule_update: 0,
      skill_acquisition: 0,
      performance: 0,
    }

    let totalConfidence = 0
    let appliedCount = 0

    for (const l of all) {
      byType[l.type]++
      totalConfidence += l.confidence
      if (l.applied) appliedCount++
    }

    return {
      totalLearnings: all.length,
      appliedLearnings: appliedCount,
      avgConfidence: all.length > 0 ? totalConfidence / all.length : 0,
      byType,
    }
  }

  async markApplied(id: string): Promise<Learning> {
    const updated = await this.repo.update(id, {
      applied: true,
      appliedAt: new Date().toISOString(),
    })
    if (!updated) {
      throw new NotFoundError('Learning', id)
    }
    this.logger.info('Learning marked as applied', { id })
    return updated
  }

  async learnFromReflection(
    reflection: Reflection,
    decision: Decision,
  ): Promise<Learning[]> {
    const learnings: Learning[] = []

    // 基于反思结果提取学习
    const inputs = this.extractLearnings(reflection, decision)

    for (const input of inputs) {
      const learning = await this.learn(input)
      learnings.push(learning)
    }

    this.logger.info('Learnings extracted from reflection', {
      reflectionId: reflection.id,
      count: learnings.length,
    })

    return learnings
  }

  async getRuleUpdates(): Promise<Learning[]> {
    const all = await this.repo.findAll()
    return all.filter(
      (l) => l.type === 'rule_update' && !l.applied && l.suggestedRuleUpdate,
    )
  }

  /**
   * 从反思中提取学习输入
   * 基于行动类型和结果类型生成不同的学习记录。
   */
  private extractLearnings(
    reflection: Reflection,
    decision: Decision,
  ): CreateLearningInput[] {
    const inputs: CreateLearningInput[] = []
    const actionType = decision.actionType

    // 失败 → 模式学习
    if (reflection.outcome === 'failure') {
      inputs.push({
        type: 'pattern',
        pattern: `Action '${actionType}' tends to fail under current conditions`,
        context: `Triggered by decision: ${decision.reasoning}`,
        sourceAction: actionType,
        suggestedRuleUpdate: `Consider adding preconditions for '${actionType}' action`,
      })

      // 多次失败 → 规则更新建议
      inputs.push({
        type: 'rule_update',
        pattern: `Repeated failures of '${actionType}' suggest rule adjustment needed`,
        context: `Action failed with outcome: ${reflection.outcome}`,
        sourceAction: actionType,
        suggestedRuleUpdate: `Lower confidence for '${actionType}' rule or add fallback action`,
      })
    }

    // 部分成功 → 性能学习
    if (reflection.outcome === 'partial') {
      inputs.push({
        type: 'performance',
        pattern: `Action '${actionType}' partially succeeds, indicating suboptimal conditions`,
        context: `Partial outcome with ${reflection.learnings.length} learnings`,
        sourceAction: actionType,
        suggestedRuleUpdate: `Add precondition check before '${actionType}' to ensure full success`,
      })
    }

    // 成功 + 有异常未解决 → 模式学习
    if (
      reflection.outcome === 'success' &&
      reflection.learnings.some((l) => l.includes('unresolved'))
    ) {
      inputs.push({
        type: 'pattern',
        pattern: `Action '${actionType}' succeeds but leaves anomalies unresolved`,
        context: 'Success with remaining anomalies',
        sourceAction: actionType,
        suggestedRuleUpdate: `Consider chaining '${actionType}' with a follow-up action`,
      })
    }

    // 成功 + 生成了新目标 → 技能习得
    if (
      reflection.outcome === 'success' &&
      reflection.newGoalDescriptions.length > 0
    ) {
      inputs.push({
        type: 'skill_acquisition',
        pattern: `Action '${actionType}' generates follow-up goals, indicating capability gap`,
        context: `Generated ${reflection.newGoalDescriptions.length} new goals`,
        sourceAction: actionType,
        suggestedRuleUpdate:
          'Consider registering a new skill to handle follow-up goals autonomously',
      })
    }

    // 从 learnings 中提取具体模式
    for (const learning of reflection.learnings) {
      if (learning.includes('failed') || learning.includes('failed')) {
        inputs.push({
          type: 'pattern',
          pattern: learning,
          context: 'Extracted from reflection learnings',
          sourceAction: actionType,
        })
      }
    }

    return inputs
  }
}
