import { randomUUID } from 'node:crypto'
import type { SqliteRepository } from '../../core_layer/data/access/sqlite_repository.js'
import type { Logger } from '../../core_layer/logic/logger.js'
import { NotFoundError } from '../../core_layer/model/errors.js'
import type { ITaskPlanner } from '../agent.interface.js'
import type {
  CreateTaskInput,
  Milestone,
  Task,
  TaskProgress,
  TaskStatus,
} from '../model/task.js'

/** Milestone 存储类型（扩展 BaseEntity 字段用于 SQLite） */
type MilestoneRow = Milestone & { id: string; createdAt: Date; updatedAt: Date }

/**
 * 长任务规划器
 *
 * 将复杂目标分解为可执行的子任务树，跟踪进度，支持检查点恢复。
 *
 * 设计原则：
 * - 任务形成树结构，支持多级分解
 * - 同级任务按 order 顺序执行（前序依赖）
 * - 检查点支持长任务中断后恢复
 * - 里程碑标记关键节点，用于进度可视化
 * - 所有状态持久化到 SQLite，跨重启不丢失
 *
 * 这是 Agent "自主学会自己驱动自己完成长任务"的核心：
 * Agent 将长任务分解为子任务，逐个执行，跟踪进度，中断后可恢复。
 */
export class TaskPlanner implements ITaskPlanner {
  constructor(
    private readonly logger: Logger,
    private readonly taskRepo: SqliteRepository<Task>,
    private readonly milestoneRepo: SqliteRepository<MilestoneRow>,
  ) {}

  async plan(goalId: string, description: string): Promise<Task[]> {
    this.logger.info('Planning task decomposition', { goalId, description })

    const subtasks = this.decompose(description)
    const created: Task[] = []

    for (let i = 0; i < subtasks.length; i++) {
      const task = await this.taskRepo.create({
        parentGoalId: goalId,
        parentTaskId: undefined,
        title: subtasks[i].title,
        description: subtasks[i].description,
        status: 'pending',
        priority: 'medium',
        assignedAgentId: undefined,
        subtaskIds: [],
        order: i,
        result: undefined,
        checkpoint: undefined,
        failureReason: undefined,
      })
      created.push(task)
    }

    this.logger.info('Task plan created', { goalId, taskCount: created.length })
    return created
  }

  async addTask(input: CreateTaskInput): Promise<Task> {
    const order = input.order ?? 0
    const task = await this.taskRepo.create({
      parentGoalId: input.parentGoalId,
      parentTaskId: input.parentTaskId,
      title: input.title,
      description: input.description,
      status: 'pending',
      priority: input.priority ?? 'medium',
      assignedAgentId: undefined,
      subtaskIds: [],
      order,
      result: undefined,
      checkpoint: undefined,
      failureReason: undefined,
    })

    // 如果有父任务，将此任务加入父任务的 subtaskIds
    if (input.parentTaskId) {
      const parent = await this.taskRepo.findById(input.parentTaskId)
      if (parent) {
        const updatedSubtaskIds = [...parent.subtaskIds, task.id]
        await this.taskRepo.update(parent.id, { subtaskIds: updatedSubtaskIds })
      }
    }

    this.logger.info('Task added', { taskId: task.id, title: task.title })
    return task
  }

  async getTaskTree(taskId: string): Promise<Task[]> {
    const root = await this.taskRepo.findById(taskId)
    if (!root) return []

    const tree: Task[] = [root]
    for (const subtaskId of root.subtaskIds) {
      const subtree = await this.getTaskTree(subtaskId)
      tree.push(...subtree)
    }
    return tree
  }

  async getTasksByGoal(goalId: string): Promise<Task[]> {
    const all = await this.taskRepo.findAll()
    return all.filter((t) => t.parentGoalId === goalId)
  }

  async nextExecutable(goalId: string): Promise<Task | null> {
    const tasks = await this.getTasksByGoal(goalId)
    const pending = tasks.filter((t) => t.status === 'pending')

    if (pending.length === 0) return null

    // 按 order 排序
    pending.sort((a, b) => a.order - b.order)

    // 找到第一个可执行的：前序同级任务都已完成
    for (const task of pending) {
      if (await this.isExecutable(task, tasks)) {
        return task
      }
    }

    return null
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: string,
  ): Promise<Task> {
    const updates: Partial<Task> = { status }
    if (result !== undefined) {
      updates.result = result
    }
    if (status === 'failed') {
      updates.failureReason = result
    }

    const updated = await this.taskRepo.update(taskId, updates)
    if (!updated) {
      throw new NotFoundError('Task', taskId)
    }

    this.logger.info('Task status updated', { taskId, status })
    return updated
  }

  async saveCheckpoint(taskId: string, checkpoint: string): Promise<void> {
    const updated = await this.taskRepo.update(taskId, { checkpoint })
    if (!updated) {
      throw new NotFoundError('Task', taskId)
    }
    this.logger.info('Checkpoint saved', { taskId, size: checkpoint.length })
  }

  async restoreCheckpoint(taskId: string): Promise<string | null> {
    const task = await this.taskRepo.findById(taskId)
    return task?.checkpoint ?? null
  }

  async getProgress(goalId: string): Promise<TaskProgress> {
    const tasks = await this.getTasksByGoal(goalId)
    const total = tasks.length
    const completed = tasks.filter((t) => t.status === 'completed').length
    const failed = tasks.filter((t) => t.status === 'failed').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const blocked = tasks.filter((t) => t.status === 'blocked').length

    return {
      totalTasks: total,
      completedTasks: completed,
      failedTasks: failed,
      inProgressTasks: inProgress,
      blockedTasks: blocked,
      completionRate: total > 0 ? completed / total : 0,
    }
  }

  async addMilestone(
    taskId: string,
    title: string,
    description: string,
  ): Promise<Milestone> {
    const existing = await this.getMilestones(taskId)
    const order = existing.length

    const row = await this.milestoneRepo.create({
      taskId,
      title,
      description,
      completed: false,
      completedAt: undefined,
      order,
    })

    this.logger.info('Milestone added', { milestoneId: row.id, taskId, title })
    return {
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      description: row.description,
      completed: row.completed,
      completedAt: row.completedAt,
      order: row.order,
    }
  }

  async completeMilestone(milestoneId: string): Promise<Milestone> {
    const updated = await this.milestoneRepo.update(milestoneId, {
      completed: true,
      completedAt: new Date().toISOString(),
    })
    if (!updated) {
      throw new NotFoundError('Milestone', milestoneId)
    }

    this.logger.info('Milestone completed', { milestoneId })
    return {
      id: updated.id,
      taskId: updated.taskId,
      title: updated.title,
      description: updated.description,
      completed: updated.completed,
      completedAt: updated.completedAt,
      order: updated.order,
    }
  }

  async getMilestones(taskId: string): Promise<Milestone[]> {
    const all = await this.milestoneRepo.findAll()
    return all
      .filter((m) => m.taskId === taskId)
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        id: m.id,
        taskId: m.taskId,
        title: m.title,
        description: m.description,
        completed: m.completed,
        completedAt: m.completedAt,
        order: m.order,
      }))
  }

  /**
   * 基于描述关键词分解任务
   * 从第一性原理出发：根据描述中的动作词识别子任务。
   */
  private decompose(
    description: string,
  ): Array<{ title: string; description: string }> {
    const lower = description.toLowerCase()
    const subtasks: Array<{ title: string; description: string }> = []

    // 识别常见动作模式
    const patterns: Array<{ keywords: string[]; title: string; desc: string }> =
      [
        {
          keywords: ['clean', 'cleanup', '清理'],
          title: '清理数据',
          desc: '清理过期和冗余数据',
        },
        {
          keywords: ['optimize', '优化'],
          title: '优化性能',
          desc: '优化系统性能指标',
        },
        {
          keywords: ['monitor', '监控'],
          title: '监控系统',
          desc: '采集系统指标并监控异常',
        },
        {
          keywords: ['report', '报告'],
          title: '生成报告',
          desc: '生成系统状态报告',
        },
        {
          keywords: ['test', 'check', '检查', '自检'],
          title: '运行自检',
          desc: '运行系统自检',
        },
        {
          keywords: ['fix', 'repair', '修复'],
          title: '修复问题',
          desc: '诊断并修复检测到的问题',
        },
        {
          keywords: ['analyze', '分析'],
          title: '分析趋势',
          desc: '分析数据和趋势',
        },
        {
          keywords: ['backup', '备份'],
          title: '备份数据',
          desc: '备份关键数据',
        },
      ]

    let matched = false
    for (const p of patterns) {
      if (p.keywords.some((kw) => lower.includes(kw))) {
        subtasks.push({ title: p.title, description: p.desc })
        matched = true
      }
    }

    // 如果没有匹配到任何模式，创建一个通用任务
    if (!matched) {
      subtasks.push({
        title: `执行: ${description.slice(0, 50)}`,
        description,
      })
    }

    // 如果只匹配到一个，添加一个验证步骤
    if (subtasks.length === 1) {
      subtasks.push({
        title: '验证结果',
        description: '验证任务执行结果是否符合预期',
      })
    }

    return subtasks
  }

  /**
   * 判断任务是否可执行
   * 规则：前序同级任务（同 parentTaskId，更低 order）都已完成
   */
  private async isExecutable(task: Task, allTasks: Task[]): Promise<boolean> {
    // 找到同级前序任务
    const siblings = allTasks.filter(
      (t) => t.parentTaskId === task.parentTaskId && t.id !== task.id,
    )

    for (const sibling of siblings) {
      if (sibling.order < task.order && sibling.status !== 'completed') {
        return false
      }
    }

    return true
  }
}
