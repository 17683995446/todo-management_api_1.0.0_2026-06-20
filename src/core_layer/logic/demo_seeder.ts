/**
 * 演示数据播种器
 *
 * 提供可复用的演示用户与样例数据播种逻辑，
 * 供 HTTP 服务器启动和 CLI init 命令共享调用。
 */

import type { SqliteRepository } from '../data/access/sqlite_repository.js'
import type { Todo, TodoPriority } from '../model/todo.js'
import type { User } from '../model/user.js'
import type { AuthService } from './auth_service.js'
import type { Logger } from './logger.js'

/** 演示用户凭据 */
export const DEMO_USERNAME = 'demo'
export const DEMO_PASSWORD = 'DemoPass99!'

/** 样例待办数据定义 */
const SAMPLE_TODOS: Array<{
  title: string
  completed: boolean
  priority: TodoPriority
  dueDate: Date | null
  tags: string[]
}> = [
  {
    title: '学习 TypeScript',
    completed: false,
    priority: 'high',
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    tags: ['学习', '编程'],
  },
  {
    title: '完成项目文档',
    completed: true,
    priority: 'medium',
    dueDate: null,
    tags: ['工作'],
  },
  {
    title: '代码审查',
    completed: true,
    priority: 'urgent',
    dueDate: new Date(),
    tags: ['工作', '质量'],
  },
  {
    title: '部署应用',
    completed: false,
    priority: 'low',
    dueDate: null,
    tags: ['运维'],
  },
]

/**
 * 播种演示用户与样例数据
 *
 * 仅当数据库中无任何用户时执行播种，确保幂等。
 *
 * @returns 是否执行了播种（true 表示新播种，false 表示已有数据）
 */
export async function seedDemoData(
  logger: Logger,
  userRepo: SqliteRepository<User>,
  todoRepo: SqliteRepository<Todo>,
  authService: AuthService,
): Promise<boolean> {
  const existingUsers = await userRepo.findAll()
  if (existingUsers.length > 0) {
    logger.debug(
      'Demo data already exists, skipping seed',
      { userCount: existingUsers.length },
      62,
      'seedDemoData',
    )
    return false
  }

  const passwordHash = authService.hashPassword(DEMO_PASSWORD)
  const demoUser = await userRepo.create({
    username: DEMO_USERNAME,
    passwordHash,
    displayName: '演示用户',
  })

  for (const todo of SAMPLE_TODOS) {
    await todoRepo.create({ userId: demoUser.id, ...todo })
  }

  logger.info(
    'Demo user and sample data inserted',
    { username: DEMO_USERNAME, todoCount: SAMPLE_TODOS.length },
    75,
    'seedDemoData',
  )
  return true
}
