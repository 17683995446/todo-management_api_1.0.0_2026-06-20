import { describe, expect, it, vi } from 'vitest'
import { type ZodError, z } from 'zod'
import type { AppConfig } from '../../../../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../../../../src/core_layer/logic/logger.js'
import {
  AlreadyExistsError,
  AppError,
  BudgetExceededError,
  ErrorCode,
  NotFoundError,
  UnsupportedOperationError,
  ValidationError,
} from '../../../../../src/core_layer/model/errors.js'
import {
  type ApiErrorResponse,
  createErrorHandler,
} from '../../../../../src/presentation_layer/api/features/common/error_handler.js'

const mockConfig: AppConfig = {
  app: { name: 'test', version: '1.0.0', debug: false },
  server: { host: '127.0.0.1', port: 0 },
  logging: { level: 'error', format: 'text' },
  api: { timeout: 30000, rate_limit: 100 },
}

const logger = new ConsoleLogger(mockConfig, 'error-handler-test')
const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})

/** 创建模拟 Hono Context，捕获 json() 调用 */
function createMockContext() {
  let captured: { body: unknown; status: number } | null = null
  const c = {
    json: (body: unknown, status?: number) => {
      captured = { body, status: status ?? 200 }
      return new Response(JSON.stringify(body), { status })
    },
  }
  return {
    c: c as unknown as Parameters<ReturnType<typeof createErrorHandler>>[1],
    getCaptured: (): { body: unknown; status: number } => {
      if (!captured) throw new Error('json() was not called')
      return captured
    },
  }
}

describe('createErrorHandler', () => {
  it('ZodError → 400 + INVALID_INPUT code + 字段级详情', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const schema = z.object({ title: z.string().min(1) })
    const result = schema.safeParse({ title: '' })
    expect(!result.success)
    const zodErr = result.error as ZodError

    handler(zodErr, c)

    const captured = getCaptured()
    expect(captured.status).toBe(400)
    const body = captured.body as ApiErrorResponse
    expect(body.success).toBe(false)
    expect(body.error).toBe('Validation failed')
    expect(body.code).toBe(ErrorCode.INVALID_INPUT)
    expect(Array.isArray(body.details)).toBe(true)
  })

  it('NotFoundError → 404 + NOT_FOUND code', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new NotFoundError('Todo', 'abc-123')
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(404)
    const body = captured.body as ApiErrorResponse
    expect(body.success).toBe(false)
    expect(body.error).toBe('Todo not found: abc-123')
    expect(body.code).toBe(ErrorCode.NOT_FOUND)
    expect(body.details).toMatchObject({
      resourceType: 'Todo',
      identifier: 'abc-123',
    })
  })

  it('ValidationError → 400 + INVALID_INPUT code', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new ValidationError('title is required')
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(400)
    const body = captured.body as ApiErrorResponse
    expect(body.code).toBe(ErrorCode.INVALID_INPUT)
    expect(body.error).toBe('title is required')
  })

  it('AlreadyExistsError → 409 + ALREADY_EXISTS code', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AlreadyExistsError('User', 'demo')
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(409)
    const body = captured.body as ApiErrorResponse
    expect(body.code).toBe(ErrorCode.ALREADY_EXISTS)
  })

  it('BudgetExceededError → 429 + BUDGET_EXCEEDED code', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new BudgetExceededError('tokens', 1000, 500)
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(429)
    const body = captured.body as ApiErrorResponse
    expect(body.code).toBe(ErrorCode.BUDGET_EXCEEDED)
    expect(body.details).toMatchObject({
      dimension: 'tokens',
      used: 1000,
      limit: 500,
    })
  })

  it('UnsupportedOperationError → 400 + UNSUPPORTED_OPERATION code', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new UnsupportedOperationError('delete_all')
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(400)
    const body = captured.body as ApiErrorResponse
    expect(body.code).toBe(ErrorCode.UNSUPPORTED_OPERATION)
  })

  it('AppError(UNAUTHORIZED) → 401', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AppError('Token expired', ErrorCode.UNAUTHORIZED)
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(401)
    expect((captured.body as ApiErrorResponse).code).toBe(
      ErrorCode.UNAUTHORIZED,
    )
  })

  it('AppError(FORBIDDEN) → 403', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AppError('Access denied', ErrorCode.FORBIDDEN)
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(403)
  })

  it('AppError(POLICY_VIOLATION) → 403', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AppError('Policy violated', ErrorCode.POLICY_VIOLATION)
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(403)
  })

  it('AppError(CIRCUIT_BREAKER_OPEN) → 503', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AppError(
      'Circuit breaker is OPEN',
      ErrorCode.CIRCUIT_BREAKER_OPEN,
    )
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(503)
    expect((captured.body as ApiErrorResponse).code).toBe(
      ErrorCode.CIRCUIT_BREAKER_OPEN,
    )
  })

  it('AppError(INTERNAL_ERROR) → 500', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AppError('Something went wrong', ErrorCode.INTERNAL_ERROR)
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(500)
    expect((captured.body as ApiErrorResponse).code).toBe(
      ErrorCode.INTERNAL_ERROR,
    )
  })

  it('AppError with context → details 字段填充上下文', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new AppError('DB error', ErrorCode.INTERNAL_ERROR, {
      query: 'SELECT *',
      table: 'todos',
    })
    handler(err, c)

    const captured = getCaptured()
    const body = captured.body as ApiErrorResponse
    expect(body.details).toMatchObject({ query: 'SELECT *', table: 'todos' })
  })

  it('原生 Error → 500 + 不泄露内部消息', () => {
    const handler = createErrorHandler(logger)
    const { c, getCaptured } = createMockContext()

    const err = new Error('secret internal stack trace')
    handler(err, c)

    const captured = getCaptured()
    expect(captured.status).toBe(500)
    const body = captured.body as ApiErrorResponse
    expect(body.error).toBe('Internal server error')
    expect(body.code).toBeUndefined()
    expect(body.details).toBeUndefined()
  })

  it('所有错误均触发 logger.error', () => {
    errorSpy.mockClear()
    const handler = createErrorHandler(logger)
    const { c } = createMockContext()

    handler(new Error('test'), c)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'Request error',
      { error: 'test', stack: expect.any(String) },
      32,
      'errorHandler',
    )
  })
})
