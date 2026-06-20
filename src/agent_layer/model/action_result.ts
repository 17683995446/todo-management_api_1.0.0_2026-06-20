/**
 * 行动结果实体
 * 表示 Agent 执行某个决策后的结果。
 * 这是 OODA 循环的 "Act" 阶段的输出。
 */
export interface ActionResult {
  id: string
  /** 关联的决策 ID */
  decisionId: string
  /** 是否成功 */
  success: boolean
  /** 执行输出 */
  output: unknown
  /** 错误信息（失败时） */
  error?: string
  /** 执行耗时（毫秒） */
  durationMs: number
  /** 执行时间戳 */
  timestamp: string
}
