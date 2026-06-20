import { Hono } from 'hono'
import type { Logger } from '../../../../core_layer/logic/logger.js'

/**
 * API 端点描述
 */
interface EndpointInfo {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  authRequired: boolean
}

/**
 * 创建 API 发现路由（/api 根端点）
 *
 * 返回所有可用 API 端点的清单，便于客户端自动发现与对接。
 *
 * @param logger - 日志记录器实例
 * @param version - 应用版本号
 * @returns Hono 子路由
 */
export function createApiDiscoveryRoutes(logger: Logger, version: string) {
  const router = new Hono()

  const endpoints: EndpointInfo[] = [
    {
      method: 'GET',
      path: '/health',
      description: '健康检查（服务状态、数据库连通性、内存使用）',
      authRequired: false,
    },
    {
      method: 'GET',
      path: '/api',
      description: 'API 端点发现（本接口）',
      authRequired: false,
    },
    {
      method: 'GET',
      path: '/api/todos',
      description: '列出待办事项（支持筛选、搜索、排序、分页）',
      authRequired: true,
    },
    {
      method: 'POST',
      path: '/api/todos',
      description: '创建待办事项',
      authRequired: true,
    },
    {
      method: 'PUT',
      path: '/api/todos/:id',
      description: '更新待办事项（标题、优先级、截止日期、标签、完成状态）',
      authRequired: true,
    },
    {
      method: 'DELETE',
      path: '/api/todos/:id',
      description: '删除待办事项',
      authRequired: true,
    },
    {
      method: 'POST',
      path: '/api/auth/register',
      description: '注册新用户',
      authRequired: false,
    },
    {
      method: 'POST',
      path: '/api/auth/login',
      description: '登录并获取 JWT 令牌',
      authRequired: false,
    },
    {
      method: 'GET',
      path: '/api/stats/cache',
      description: '查看缓存统计信息',
      authRequired: false,
    },
    {
      method: 'DELETE',
      path: '/api/stats/cache',
      description: '清空缓存',
      authRequired: false,
    },
  ]

  router.get('/api', (c) => {
    logger.trace('API discovery requested', {}, 60, 'apiDiscoveryRoutes')
    return c.json({
      success: true,
      data: {
        name: 'Todo API',
        version,
        description: '待办事项管理 REST API',
        endpoints: endpoints.map((e) => ({
          method: e.method,
          path: e.path,
          description: e.description,
          authRequired: e.authRequired,
        })),
      },
    })
  })

  return router
}
