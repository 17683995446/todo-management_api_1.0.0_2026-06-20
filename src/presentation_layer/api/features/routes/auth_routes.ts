import { Hono } from 'hono'
import { z } from 'zod'
import type { IRepository } from '../../../../core_layer/data/access/repository.interface.js'
import type { AuthService } from '../../../../core_layer/logic/auth_service.js'
import type { Logger } from '../../../../core_layer/logic/logger.js'
import { validatePassword } from '../../../../core_layer/logic/password_policy.js'
import { ErrorCode } from '../../../../core_layer/model/errors.js'
import type { User } from '../../../../core_layer/model/user.js'
import type { ApiContext } from '../../core/api.interface.js'

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric'),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(50).optional(),
})

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

export function createAuthRoutes(
  logger: Logger,
  userRepo: IRepository<User>,
  authService: AuthService,
) {
  const router = new Hono<{ Variables: ApiContext }>()

  router.post('/api/auth/register', async (c) => {
    logger.trace('POST /api/auth/register called', {}, 29, 'authRoutes')
    try {
      const body = await c.req.json()
      const parsed = registerSchema.safeParse(body)
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

      // 密码强度策略校验
      const policy = validatePassword(parsed.data.password)
      if (!policy.valid) {
        return c.json(
          {
            success: false,
            error: 'Weak password',
            code: ErrorCode.INVALID_INPUT,
            details: policy.errors,
          },
          400,
        )
      }

      // 检查用户名是否已存在
      const allUsers = await userRepo.findAll()
      const existing = allUsers.find((u) => u.username === parsed.data.username)
      if (existing) {
        return c.json(
          {
            success: false,
            error: 'Username already exists',
            code: ErrorCode.ALREADY_EXISTS,
          },
          409,
        )
      }

      const passwordHash = authService.hashPassword(parsed.data.password)
      const newUser = await userRepo.create({
        username: parsed.data.username,
        passwordHash,
        displayName: parsed.data.displayName || parsed.data.username,
      })

      const token = authService.generateToken({
        userId: newUser.id,
        username: newUser.username,
      })
      logger.trace(
        'POST /api/auth/register returning',
        { userId: newUser.id },
        49,
        'authRoutes',
      )

      return c.json(
        {
          success: true,
          data: {
            token,
            user: {
              id: newUser.id,
              username: newUser.username,
              displayName: newUser.displayName,
            },
          },
        },
        201,
      )
    } catch {
      return c.json(
        {
          success: false,
          error: 'Invalid request body',
          code: ErrorCode.INVALID_INPUT,
        },
        400,
      )
    }
  })

  router.post('/api/auth/login', async (c) => {
    logger.trace('POST /api/auth/login called', {}, 63, 'authRoutes')
    try {
      const body = await c.req.json()
      const parsed = loginSchema.safeParse(body)
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

      const allUsers = await userRepo.findAll()
      const user = allUsers.find((u) => u.username === parsed.data.username)
      if (!user) {
        return c.json(
          {
            success: false,
            error: 'Invalid username or password',
            code: ErrorCode.UNAUTHORIZED,
          },
          401,
        )
      }

      const valid = authService.verifyPassword(
        parsed.data.password,
        user.passwordHash,
      )
      if (!valid) {
        return c.json(
          {
            success: false,
            error: 'Invalid username or password',
            code: ErrorCode.UNAUTHORIZED,
          },
          401,
        )
      }

      const token = authService.generateToken({
        userId: user.id,
        username: user.username,
      })
      logger.trace(
        'POST /api/auth/login returning',
        { userId: user.id },
        83,
        'authRoutes',
      )

      return c.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
          },
        },
      })
    } catch {
      return c.json(
        {
          success: false,
          error: 'Invalid request body',
          code: ErrorCode.INVALID_INPUT,
        },
        400,
      )
    }
  })

  return router
}
