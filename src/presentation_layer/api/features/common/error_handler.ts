import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'
import type { Logger } from '../../../../core_layer/logic/logger.js'
import { AppError, ErrorCode } from '../../../../core_layer/model/errors.js'

/**
 * API 错误响应结构
 *
 * `code` 为机器可读的错误码（对应 ErrorCode 枚举值），
 * 便于客户端程序化处理；`details` 提供额外调试信息。
 */
export interface ApiErrorResponse {
  success: false
  error: string
  code?: string
  details?: unknown
}

/**
 * 处理 Zod 验证错误，返回 400 响应
 */
function handleZodError(err: ZodError): ApiErrorResponse {
  return {
    success: false,
    error: 'Validation failed',
    code: ErrorCode.INVALID_INPUT,
    details: err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  }
}

/**
 * ErrorCode → HTTP 状态码映射表
 *
 * 遵循 HTTP 语义：
 * - 4xx: 客户端错误（参数、认证、权限、资源不存在、冲突等）
 * - 5xx: 服务端错误（内部异常、配置问题、熔断等）
 */
const ERROR_CODE_TO_HTTP_STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.UNSUPPORTED_OPERATION]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.POLICY_VIOLATION]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.ALREADY_EXISTS]: 409,
  [ErrorCode.INVALID_STATE_TRANSITION]: 409,
  [ErrorCode.BUDGET_EXCEEDED]: 429,
  [ErrorCode.CIRCUIT_BREAKER_OPEN]: 503,
  [ErrorCode.CONFIG_LOAD_FAILED]: 500,
  [ErrorCode.CONFIG_PARSE_FAILED]: 500,
  [ErrorCode.CONFIG_VALIDATION_FAILED]: 500,
  [ErrorCode.INTERNAL_ERROR]: 500,
}

/**
 * 将 AppError 转换为 API 错误响应
 */
function handleAppError(err: AppError): {
  response: ApiErrorResponse
  status: ContentfulStatusCode
} {
  const status = ERROR_CODE_TO_HTTP_STATUS[err.code] ?? 500
  return {
    response: {
      success: false,
      error: err.message,
      code: err.code,
      details: err.context,
    },
    status,
  }
}

/**
 * 创建 Hono 全局错误处理中间件
 *
 * 错误处理策略：
 * 1. ZodError → 400 + 字段级验证详情
 * 2. AppError → 按 ErrorCode 映射的 HTTP 状态码 + 错误码 + 上下文
 * 3. 其他 Error → 500（仅返回通用消息，不泄露内部细节）
 *
 * @param logger - 日志记录器实例
 * @returns Hono 错误处理中间件
 */
export function createErrorHandler(logger: Logger) {
  return (err: Error, c: Context): Response => {
    logger.error(
      'Request error',
      { error: err.message, stack: err.stack },
      32,
      'errorHandler',
    )

    if (err instanceof ZodError) {
      return c.json(handleZodError(err), 400)
    }

    if (err instanceof AppError) {
      const { response, status } = handleAppError(err)
      return c.json(response, status)
    }

    return c.json(
      {
        success: false,
        error: 'Internal server error',
      } satisfies ApiErrorResponse,
      500,
    )
  }
}
