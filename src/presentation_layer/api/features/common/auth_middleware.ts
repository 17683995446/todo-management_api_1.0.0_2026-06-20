import { createMiddleware } from 'hono/factory'
import type { AuthService } from '../../../../core_layer/logic/auth_service.js'
import type { ApiContext } from '../../core/api.interface.js'

/**
 * 认证中间件：验证 JWT 令牌，将用户信息注入上下文
 * 如果未提供令牌或令牌无效，返回 401
 */
export function createAuthMiddleware(authService: AuthService) {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Authentication required' }, 401)
    }

    const token = authHeader.slice(7)
    const payload = authService.verifyToken(token)
    if (!payload) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401)
    }

    c.set('user', payload)
    await next()
  })
}

/**
 * 可选认证中间件：如果提供了令牌则验证，否则继续
 */
export function createOptionalAuthMiddleware(authService: AuthService) {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const payload = authService.verifyToken(token)
      if (payload) {
        c.set('user', payload)
      }
    }
    await next()
  })
}
