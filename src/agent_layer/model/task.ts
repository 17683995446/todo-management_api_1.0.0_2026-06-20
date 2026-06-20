/**
 * 任务实体
 *
 * 任务是长任务分解的基本单元。Agent 通过任务规划器将复杂目标
 * 分解为可执行的子任务树，实现"自主学会自己驱动自己完成长任务"。
 *
 * 设计原则：
 * - 任务形成树结构（parentTaskId 指向父任务）
 * - 任务有执行顺序（order 字段，同级任务按序执行）
 * - 任务支持检查点（checkpoint），可在中断后恢复
 * - 任务可分配给子 Agent（assignedAgentId）
 * - 里程碑（Milestone）用于跟踪长任务的关键节点
 */
import type { BaseEntity } from '../../core_layer/data/access/base_repository.js'

/** 任务状态 */
export type TaskStatus =
  | 'pending' // 待执行
  | 'in_progress' // 进行中
  | 'completed' // 已完成
  | 'failed' // 失败
  | 'blocked' // 被阻塞（依赖未完成）

/** 任务优先级 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

/** 任务实体 */
export interface Task extends BaseEntity {
  /** 所属目标 ID */
  parentGoalId: string
  /** 父任务 ID（顶层任务为空） */
  parentTaskId?: string
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description: string
  /** 当前状态 */
  status: TaskStatus
  /** 优先级 */
  priority: TaskPriority
  /** 分配的子 Agent ID */
  assignedAgentId?: string
  /** 子任务 ID 列表 */
  subtaskIds: string[]
  /** 同级执行顺序（0 开始） */
  order: number
  /** 执行结果摘要 */
  result?: string
  /** 检查点数据（序列化状态，用于中断恢复） */
  checkpoint?: string
  /** 失败原因 */
  failureReason?: string
}

/** 里程碑（长任务的关键节点） */
export interface Milestone {
  id: string
  /** 所属任务 ID */
  taskId: string
  /** 里程碑标题 */
  title: string
  /** 里程碑描述 */
  description: string
  /** 是否已完成 */
  completed: boolean
  /** 完成时间 */
  completedAt?: string
  /** 顺序 */
  order: number
}

/** 任务进度统计 */
export interface TaskProgress {
  /** 总任务数 */
  totalTasks: number
  /** 已完成数 */
  completedTasks: number
  /** 失败数 */
  failedTasks: number
  /** 进行中数 */
  inProgressTasks: number
  /** 被阻塞数 */
  blockedTasks: number
  /** 完成率（0-1） */
  completionRate: number
}

/** 创建任务的输入 */
export interface CreateTaskInput {
  parentGoalId: string
  parentTaskId?: string
  title: string
  description: string
  priority?: TaskPriority
  order?: number
}
