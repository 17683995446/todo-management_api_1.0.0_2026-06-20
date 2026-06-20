/**
 * 学习实体
 *
 * 学习记录是 Agent 从反思中提取的模式和经验。Agent 通过学习引擎
 * 将反思转化为可复用的知识，实现"自主学会增强自己的技能"。
 *
 * 设计原则：
 * - 学习记录可持久化，跨循环累积
 * - 学习有类型（模式、规则更新、技能习得、性能优化）
 * - 学习有置信度，多次观察提升置信度
 * - 学习可被"应用"（applied），应用后影响决策引擎
 * - 学习可建议规则更新，实现决策的自我进化
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'

/** 学习类型 */
export type LearningType =
  | 'pattern' // 行为模式（如"某类操作常在特定条件下失败"）
  | 'rule_update' // 规则更新建议
  | 'skill_acquisition' // 技能习得（发现需要新技能）
  | 'performance' // 性能优化经验

/** 学习实体 */
export interface Learning extends BaseEntity {
  /** 学习类型 */
  type: LearningType
  /** 学到的模式描述 */
  pattern: string
  /** 适用上下文 */
  context: string
  /** 置信度（0-1），多次观察递增 */
  confidence: number
  /** 观察次数 */
  occurrences: number
  /** 触发此学习的行动类型 */
  sourceAction?: string
  /** 建议的规则更新（序列化描述） */
  suggestedRuleUpdate?: string
  /** 是否已应用 */
  applied: boolean
  /** 应用时间 */
  appliedAt?: string
}

/** 学习统计 */
export interface LearningStats {
  /** 总学习数 */
  totalLearnings: number
  /** 已应用数 */
  appliedLearnings: number
  /** 平均置信度 */
  avgConfidence: number
  /** 按类型分布 */
  byType: Record<LearningType, number>
}

/** 创建学习记录的输入 */
export interface CreateLearningInput {
  type: LearningType
  pattern: string
  context: string
  sourceAction?: string
  suggestedRuleUpdate?: string
}
