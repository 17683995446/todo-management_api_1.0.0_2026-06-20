/**
 * 技能实体
 *
 * 技能是 Agent 可插拔的能力单元。Agent 通过技能系统扩展自身能力，
 * 实现"自主学会增强自己的技能"。
 *
 * 设计原则：
 * - 技能元数据（Skill）可持久化，跟踪使用统计
 * - 技能处理器（SkillHandler）是代码，运行时注册在内存中
 * - 技能可被启用/禁用，支持动态加载
 * - 技能通过 canHandle 判断是否能处理给定上下文
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'
import type { Observation } from './observation.js'

/** 技能分类 */
export type SkillCategory =
  | 'data' // 数据操作（CRUD、清理、迁移）
  | 'monitoring' // 监控（健康检查、指标采集）
  | 'maintenance' // 维护（自检、优化、修复）
  | 'communication' // 通信（告警、通知、报告）
  | 'analysis' // 分析（模式识别、趋势分析）
  | 'custom' // 自定义技能

/** 技能使用统计 */
export interface SkillStats {
  /** 总使用次数 */
  timesUsed: number
  /** 成功次数 */
  successCount: number
  /** 失败次数 */
  failureCount: number
  /** 平均执行耗时（毫秒） */
  avgDurationMs: number
  /** 最后使用时间 */
  lastUsedAt?: string
}

/** 技能元数据（可持久化） */
export interface Skill extends BaseEntity {
  /** 技能名称（唯一标识） */
  name: string
  /** 人类可读描述 */
  description: string
  /** 分类 */
  category: SkillCategory
  /** 版本号 */
  version: string
  /** 是否启用 */
  enabled: boolean
  /** 使用统计 */
  stats: SkillStats
}

/** 技能执行上下文 */
export interface SkillContext {
  /** 关联的目标 ID */
  goalId?: string
  /** 当前观察快照 */
  observation?: Observation
  /** 执行参数 */
  params: Record<string, unknown>
}

/** 技能执行结果 */
export interface SkillResult {
  /** 是否成功 */
  success: boolean
  /** 输出数据 */
  output: unknown
  /** 错误信息 */
  error?: string
  /** 执行耗时（毫秒） */
  durationMs: number
}

/**
 * 技能处理器接口（代码层面，运行时注册）
 *
 * 每个技能必须实现此接口。Agent 通过 canHandle 判断技能适用性，
 * 通过 execute 执行技能逻辑。
 */
export interface SkillHandler {
  /** 判断此技能是否能处理给定上下文 */
  canHandle(context: SkillContext): boolean
  /** 执行技能 */
  execute(context: SkillContext): Promise<SkillResult>
}

/** 注册技能的输入 */
export interface RegisterSkillInput {
  name: string
  description: string
  category: SkillCategory
  version?: string
  handler: SkillHandler
}
