/**
 * 错误码枚举
 *
 * 定义系统中所有错误类型的唯一标识。
 * 错误码用于日志聚合、错误分类和程序化错误处理。
 */
export enum ErrorCode {
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
  CONFIG_PARSE_FAILED = 'CONFIG_PARSE_FAILED',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** 资源已存在（重复创建） */
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  /** 状态转换非法 */
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  /** 策略违规 */
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  /** 资源预算耗尽 */
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  /** 熔断器打开 */
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  /** 操作不支持 */
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',
}

/**
 * 应用错误基类
 *
 * 所有自定义错误的根类。携带错误码、上下文信息，
 * 支持程序化错误处理和结构化日志记录。
 *
 * 设计原则：
 * - 错误码（ErrorCode）用于分类和程序化处理
 * - 上下文（context）提供调试所需的额外信息
 * - 继承 Error 保持与 try/catch 生态兼容
 * - name 属性设为类名，便于日志识别
 */
export class AppError extends Error {
  /** 错误码 */
  readonly code: ErrorCode
  /** 上下文信息（用于调试和日志） */
  readonly context?: Record<string, unknown>

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.context = context
    // 保持原型链正确（TS 继承 Error 的已知问题修复）
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * 转换为 JSON 可序列化对象（用于日志/审计）
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    }
  }
}

/**
 * 未找到错误
 *
 * 当请求的资源不存在时抛出。
 */
export class NotFoundError extends AppError {
  constructor(
    resourceType: string,
    identifier: string,
    context?: Record<string, unknown>,
  ) {
    super(`${resourceType} not found: ${identifier}`, ErrorCode.NOT_FOUND, {
      resourceType,
      identifier,
      ...context,
    })
  }
}

/**
 * 已存在错误
 *
 * 当尝试创建已存在的资源时抛出。
 */
export class AlreadyExistsError extends AppError {
  constructor(
    resourceType: string,
    identifier: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `${resourceType} already exists: ${identifier}`,
      ErrorCode.ALREADY_EXISTS,
      { resourceType, identifier, ...context },
    )
  }
}

/**
 * 验证错误
 *
 * 当输入数据不合法时抛出。
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, ErrorCode.INVALID_INPUT, context)
  }
}

/**
 * 状态转换错误
 *
 * 当状态机的状态转换非法时抛出。
 */
export class StateTransitionError extends AppError {
  constructor(
    fromState: string,
    toState: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `Invalid state transition: ${fromState} → ${toState}`,
      ErrorCode.INVALID_STATE_TRANSITION,
      { fromState, toState, ...context },
    )
  }
}

/**
 * 策略违规错误
 *
 * 当行动被策略引擎拒绝时抛出。
 */
export class PolicyViolationError extends AppError {
  constructor(
    policyName: string,
    reason: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `Policy '${policyName}' violated: ${reason}`,
      ErrorCode.POLICY_VIOLATION,
      { policyName, reason, ...context },
    )
  }
}

/**
 * 预算耗尽错误
 *
 * 当资源预算超限时抛出。
 */
export class BudgetExceededError extends AppError {
  constructor(
    dimension: string,
    used: number,
    limit: number,
    context?: Record<string, unknown>,
  ) {
    super(
      `Budget exceeded for ${dimension}: ${used}/${limit}`,
      ErrorCode.BUDGET_EXCEEDED,
      { dimension, used, limit, ...context },
    )
  }
}

/**
 * 不支持操作错误
 *
 * 当请求的操作不被支持时抛出。
 */
export class UnsupportedOperationError extends AppError {
  constructor(operation: string, context?: Record<string, unknown>) {
    super(
      `Unsupported operation: ${operation}`,
      ErrorCode.UNSUPPORTED_OPERATION,
      { operation, ...context },
    )
  }
}

/**
 * 配置错误
 *
 * 当配置加载、解析或验证失败时抛出。
 */
export class ConfigError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.CONFIG_VALIDATION_FAILED,
    context?: Record<string, unknown>,
  ) {
    super(message, code, context)
  }
}
