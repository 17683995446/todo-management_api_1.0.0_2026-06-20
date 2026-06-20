/**
 * 反思实体
 * 表示 Agent 对一次行动结果的评估和从中学习到的内容。
 * 反思模块会基于评估结果生成新的目标，形成自驱闭环。
 */
export type ReflectionOutcome = 'success' | 'partial' | 'failure'

export interface Reflection {
  id: string
  /** 关联的行动结果 ID */
  actionResultId: string
  /** 结果评估 */
  outcome: ReflectionOutcome
  /** 学到的经验教训 */
  learnings: string[]
  /** 基于反思生成的新目标描述列表 */
  newGoalDescriptions: string[]
  /** 反思时间戳 */
  timestamp: string
}
