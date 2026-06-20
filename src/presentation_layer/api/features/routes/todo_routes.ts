import { Hono } from 'hono'
import type { SqliteRepository } from '../../../../core_layer/data/access/sqlite_repository.js'
import type { AuthService } from '../../../../core_layer/logic/auth_service.js'
import type { InMemoryCache } from '../../../../core_layer/logic/in_memory_cache.js'
import type { Logger } from '../../../../core_layer/logic/logger.js'
import { ErrorCode } from '../../../../core_layer/model/errors.js'
import type { Todo, TodoPriority } from '../../../../core_layer/model/todo.js'
import {
  PRIORITY_ORDER,
  priorityWeight,
} from '../../../../core_layer/model/todo.js'
import type { ApiContext } from '../../core/api.interface.js'
import { createAuthMiddleware } from '../common/auth_middleware.js'
import {
  type CreateTodoInput,
  createTodoSchema,
} from '../common/create_todo_validator.js'
import {
  type UpdateTodoInput,
  updateTodoSchema,
} from '../common/update_todo_validator.js'

/**
 * 通用 API 成功响应结构
 */
export interface ApiSuccessResponse<T> {
  success: true
  data: T
}

/**
 * 列表查询响应（带分页元信息）
 */
export interface ApiListResponse<T> {
  success: true
  data: T[]
  total: number
  limit: number | null
  offset: number
}

/** 缓存 TTL：10 秒 */
const CACHE_TTL_MS = 10_000

/**
 * 构造用户维度的缓存前缀，用于变更时批量失效
 */
function userCachePrefix(userId: string): string {
  return `todos:${userId}:`
}

/**
 * 构造列表查询的缓存键
 */
function listCacheKey(userId: string, queryString: string): string {
  return `${userCachePrefix(userId)}list:${queryString}`
}

const SORTABLE_COLUMNS = new Set([
  'createdAt',
  'updatedAt',
  'dueDate',
  'priority',
  'title',
  'completed',
])
const VALID_PRIORITIES = new Set<string>(PRIORITY_ORDER)

/**
 * 解析列表查询参数，构造 SQLite query 选项
 */
function parseListQuery(
  user: { userId: string },
  getQuery: (key: string) => string | null,
) {
  const where: Array<{ column: string; op: '=' | 'LIKE'; value: unknown }> = [
    { column: 'userId', op: '=', value: user.userId },
  ]

  const status = getQuery('status')
  if (status === 'completed')
    where.push({ column: 'completed', op: '=', value: 1 })
  else if (status === 'pending')
    where.push({ column: 'completed', op: '=', value: 0 })

  const priority = getQuery('priority')
  if (priority && VALID_PRIORITIES.has(priority))
    where.push({ column: 'priority', op: '=', value: priority })

  const search = getQuery('search')
  if (search && search.trim().length > 0)
    where.push({ column: 'title', op: 'LIKE', value: `%${search.trim()}%` })

  const tag = getQuery('tag')
  if (tag && tag.trim().length > 0)
    where.push({ column: 'tags', op: 'LIKE', value: `%"${tag.trim()}"%` })

  let orderBy = getQuery('sort') ?? 'createdAt'
  if (!SORTABLE_COLUMNS.has(orderBy)) orderBy = 'createdAt'
  const order: 'ASC' | 'DESC' =
    (getQuery('order') ?? 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

  let limit: number | undefined
  const limitStr = getQuery('limit')
  if (limitStr) {
    const n = Number.parseInt(limitStr, 10)
    if (Number.isFinite(n) && n > 0 && n <= 500) limit = n
  }
  let offset = 0
  const offsetStr = getQuery('offset')
  if (offsetStr) {
    const n = Number.parseInt(offsetStr, 10)
    if (Number.isFinite(n) && n >= 0) offset = n
  }

  return { where, orderBy, order, limit, offset }
}

/**
 * 对结果按优先级排序（SQLite 无法直接按 priority 权重排序，需在内存中重排）
 */
function applyPrioritySort(todos: Todo[], order: 'ASC' | 'DESC'): Todo[] {
  const sorted = [...todos].sort(
    (a, b) => priorityWeight(a.priority) - priorityWeight(b.priority),
  )
  return order === 'DESC' ? sorted.reverse() : sorted
}

/**
 * 创建 Todo RESTful 路由（需要认证）
 * @param logger - 日志记录器实例
 * @param todoRepo - Todo 仓储实例
 * @param authService - 认证服务实例
 * @param cache - 可选的缓存实例
 * @returns Hono 子路由
 */
export function createTodoRoutes(
  logger: Logger,
  todoRepo: SqliteRepository<Todo>,
  authService: AuthService,
  cache: InMemoryCache<string, unknown> | null = null,
) {
  const router = new Hono<{ Variables: ApiContext }>()
  const authMiddleware = createAuthMiddleware(authService)

  // 所有 Todo 路由都需要认证
  router.use('/api/todos/*', authMiddleware)
  router.use('/api/todos', authMiddleware)

  // 列表查询：支持 search/status/priority/tag/sort/order/limit/offset
  router.get('/api/todos', async (c) => {
    const user = c.get('user')
    if (!user)
      return c.json(
        { success: false, error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED },
        401,
      )
    logger.trace(
      'GET /api/todos called',
      { userId: user.userId },
      102,
      'todoRoutes',
    )

    const { where, orderBy, order, limit, offset } = parseListQuery(
      user,
      (key) => c.req.query(key) ?? null,
    )

    // 尝试命中缓存
    const queryString = c.req.url.split('?')[1] ?? ''
    const cacheKey = listCacheKey(user.userId, queryString)
    if (cache) {
      const cached = await cache.get(cacheKey)
      if (cached) {
        logger.trace(
          'GET /api/todos cache hit',
          { userId: user.userId },
          111,
          'todoRoutes',
        )
        return c.json(cached)
      }
    }

    const todos = await todoRepo.query({ where, orderBy, order, limit, offset })
    // 若按 priority 排序，使用内存权重排序覆盖 SQLite 字典序
    const finalTodos =
      orderBy === 'priority' ? applyPrioritySort(todos, order) : todos

    const total = await todoRepo.count(where)
    logger.trace(
      'GET /api/todos returning',
      { count: finalTodos.length, total },
      120,
      'todoRoutes',
    )
    const response = {
      success: true,
      data: finalTodos,
      total,
      limit: limit ?? null,
      offset,
    } satisfies ApiListResponse<Todo>

    // 写入缓存
    if (cache) {
      await cache.set(cacheKey, response, CACHE_TTL_MS)
    }
    return c.json(response)
  })

  router.post(
    '/api/todos',
    async (c, next) => {
      try {
        const body = await c.req.json()
        const parsed = createTodoSchema.safeParse(body)
        if (!parsed.success) {
          return c.json(
            {
              success: false,
              error: 'Validation failed',
              code: ErrorCode.INVALID_INPUT,
              details: parsed.error.errors,
            },
            400,
          )
        }
        c.set('parsedBody', parsed.data)
        await next()
      } catch {
        return c.json(
          {
            success: false,
            error: 'Validation failed',
            code: ErrorCode.INVALID_INPUT,
            details: 'Invalid or empty JSON body',
          },
          400,
        )
      }
    },
    async (c) => {
      const user = c.get('user')
      if (!user)
        return c.json(
          {
            success: false,
            error: 'Unauthorized',
            code: ErrorCode.UNAUTHORIZED,
          },
          401,
        )
      logger.trace(
        'POST /api/todos called',
        { userId: user.userId },
        175,
        'todoRoutes',
      )
      const body = c.get('parsedBody') as CreateTodoInput
      const newTodo = await todoRepo.create({
        userId: user.userId,
        title: body.title,
        completed: body.completed ?? false,
        priority: (body.priority as TodoPriority | undefined) ?? 'medium',
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        tags: body.tags ?? [],
      })
      // 失效该用户的列表缓存
      if (cache) await cache.deleteByPrefix(userCachePrefix(user.userId))
      logger.trace(
        'POST /api/todos returning',
        { id: newTodo.id },
        185,
        'todoRoutes',
      )
      return c.json(
        { success: true, data: newTodo } satisfies ApiSuccessResponse<Todo>,
        201,
      )
    },
  )

  router.put(
    '/api/todos/:id',
    async (c, next) => {
      try {
        const body = await c.req.json()
        const parsed = updateTodoSchema.safeParse(body)
        if (!parsed.success) {
          return c.json(
            {
              success: false,
              error: 'Validation failed',
              code: ErrorCode.INVALID_INPUT,
              details: parsed.error.errors,
            },
            400,
          )
        }
        c.set('parsedBody', parsed.data)
        await next()
      } catch {
        return c.json(
          {
            success: false,
            error: 'Validation failed',
            code: ErrorCode.INVALID_INPUT,
            details: 'Invalid or empty JSON body',
          },
          400,
        )
      }
    },
    async (c) => {
      const user = c.get('user')
      if (!user)
        return c.json(
          {
            success: false,
            error: 'Unauthorized',
            code: ErrorCode.UNAUTHORIZED,
          },
          401,
        )
      const id = c.req.param('id')
      logger.trace(
        'PUT /api/todos/:id called',
        { id, userId: user.userId },
        206,
        'todoRoutes',
      )
      const existing = await todoRepo.findById(id)
      if (!existing) {
        return c.json(
          {
            success: false,
            error: 'Todo not found',
            code: ErrorCode.NOT_FOUND,
          },
          404,
        )
      }
      // 确保用户只能更新自己的 Todo
      if (existing.userId !== user.userId) {
        return c.json(
          {
            success: false,
            error: 'Todo not found',
            code: ErrorCode.NOT_FOUND,
          },
          404,
        )
      }
      const body = c.get('parsedBody') as UpdateTodoInput
      const updates: Partial<Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>> = {}
      if (body.title !== undefined) updates.title = body.title
      if (body.completed !== undefined) updates.completed = body.completed
      if (body.priority !== undefined)
        updates.priority = body.priority as TodoPriority
      if (body.dueDate !== undefined)
        updates.dueDate = body.dueDate ? new Date(body.dueDate) : null
      if (body.tags !== undefined) updates.tags = body.tags
      const updated = await todoRepo.update(id, updates)
      // 失效该用户的列表缓存
      if (cache) await cache.deleteByPrefix(userCachePrefix(user.userId))
      logger.trace('PUT /api/todos/:id returning', { id }, 223, 'todoRoutes')
      return c.json({
        success: true,
        data: updated,
      } satisfies ApiSuccessResponse<Todo | null>)
    },
  )

  router.delete('/api/todos/:id', async (c) => {
    const user = c.get('user')
    if (!user)
      return c.json(
        { success: false, error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED },
        401,
      )
    const id = c.req.param('id')
    logger.trace(
      'DELETE /api/todos/:id called',
      { id, userId: user.userId },
      231,
      'todoRoutes',
    )
    const existing = await todoRepo.findById(id)
    if (!existing || existing.userId !== user.userId) {
      return c.json(
        { success: false, error: 'Todo not found', code: ErrorCode.NOT_FOUND },
        404,
      )
    }
    const deleted = await todoRepo.delete(id)
    if (!deleted) {
      logger.trace(
        'DELETE /api/todos/:id: not found',
        { id },
        237,
        'todoRoutes',
      )
      return c.json(
        { success: false, error: 'Todo not found', code: ErrorCode.NOT_FOUND },
        404,
      )
    }
    // 失效该用户的列表缓存
    if (cache) await cache.deleteByPrefix(userCachePrefix(user.userId))
    logger.trace('DELETE /api/todos/:id returning', { id }, 242, 'todoRoutes')
    return c.json({
      success: true,
      data: null,
    } satisfies ApiSuccessResponse<null>)
  })

  return router
}
