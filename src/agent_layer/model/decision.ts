/**
 * 决策实体
 * 表示 Agent 基于观察结果做出的行动决策。
 * 这是 OODA 循环的 "Orient + Decide" 阶段的输出。
 */
export type ActionType =
  | 'noop' // 无需操作
  | 'create_todo' // 创建待办事项
  | 'complete_todo' // 完成待办事项
  | 'cleanup' // 清理过期/冗余数据
  | 'alert' // 发出告警
  | 'optimize' // 执行优化（如清理缓存）
  | 'self_test' // 运行自检
  | 'report' // 生成报告
  | 'create_goal' // 创建新目标

export interface Decision {
  id: string
  /** 关联的目标 ID（可选，决策可能不服务于特定目标） */
  goalId?: string
  /** 关联的观察 ID */
  observationId: string
  /** 行动类型 */
  actionType: ActionType
  /** 行动参数 */
  actionParams: Record<string, unknown>
  /** 决策理由（为什么选择这个行动） */
  reasoning: string
  /** 置信度（0-1） */
  confidence: number
  /** 创建时间 */
  createdAt: string
}
