import { describe, expect, it } from 'vitest'
import {
  AlreadyExistsError,
  AppError,
  BudgetExceededError,
  ConfigError,
  ErrorCode,
  NotFoundError,
  PolicyViolationError,
  StateTransitionError,
  UnsupportedOperationError,
  ValidationError,
} from '../../../src/core_layer/model/errors.js'

describe('ErrorCode', () => {
  it('should have all original error codes defined', () => {
    expect(ErrorCode.CONFIG_LOAD_FAILED).toEqual('CONFIG_LOAD_FAILED')
    expect(ErrorCode.CONFIG_PARSE_FAILED).toEqual('CONFIG_PARSE_FAILED')
    expect(ErrorCode.CONFIG_VALIDATION_FAILED).toEqual(
      'CONFIG_VALIDATION_FAILED',
    )
    expect(ErrorCode.INVALID_INPUT).toEqual('INVALID_INPUT')
    expect(ErrorCode.UNAUTHORIZED).toEqual('UNAUTHORIZED')
    expect(ErrorCode.FORBIDDEN).toEqual('FORBIDDEN')
    expect(ErrorCode.NOT_FOUND).toEqual('NOT_FOUND')
    expect(ErrorCode.INTERNAL_ERROR).toEqual('INTERNAL_ERROR')
  })

  it('should have new error codes defined', () => {
    expect(ErrorCode.ALREADY_EXISTS).toEqual('ALREADY_EXISTS')
    expect(ErrorCode.INVALID_STATE_TRANSITION).toEqual(
      'INVALID_STATE_TRANSITION',
    )
    expect(ErrorCode.POLICY_VIOLATION).toEqual('POLICY_VIOLATION')
    expect(ErrorCode.BUDGET_EXCEEDED).toEqual('BUDGET_EXCEEDED')
    expect(ErrorCode.CIRCUIT_BREAKER_OPEN).toEqual('CIRCUIT_BREAKER_OPEN')
    expect(ErrorCode.UNSUPPORTED_OPERATION).toEqual('UNSUPPORTED_OPERATION')
  })

  it('should have valid error code values', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(typeof code).toEqual('string')
      expect(code.length).toBeGreaterThan(0)
    }
  })
})

describe('AppError', () => {
  it('should be an instance of Error', () => {
    const err = new AppError('test message')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })

  it('should set message correctly', () => {
    const err = new AppError('something went wrong')
    expect(err.message).toBe('something went wrong')
  })

  it('should default to INTERNAL_ERROR code', () => {
    const err = new AppError('test')
    expect(err.code).toBe(ErrorCode.INTERNAL_ERROR)
  })

  it('should accept custom code', () => {
    const err = new AppError('test', ErrorCode.NOT_FOUND)
    expect(err.code).toBe(ErrorCode.NOT_FOUND)
  })

  it('should accept context', () => {
    const err = new AppError('test', ErrorCode.INTERNAL_ERROR, {
      userId: '123',
      action: 'delete',
    })
    expect(err.context).toEqual({ userId: '123', action: 'delete' })
  })

  it('should have undefined context when not provided', () => {
    const err = new AppError('test')
    expect(err.context).toBeUndefined()
  })

  it('should set name to constructor name', () => {
    const err = new AppError('test')
    expect(err.name).toBe('AppError')
  })

  it('should have a stack trace', () => {
    const err = new AppError('test')
    expect(err.stack).toBeDefined()
  })

  it('should serialize to JSON', () => {
    const err = new AppError('test message', ErrorCode.NOT_FOUND, { id: '42' })
    const json = err.toJSON()
    expect(json.name).toBe('AppError')
    expect(json.code).toBe(ErrorCode.NOT_FOUND)
    expect(json.message).toBe('test message')
    expect(json.context).toEqual({ id: '42' })
  })

  it('should maintain prototype chain (instanceof works in subclasses)', () => {
    class CustomError extends AppError {}
    const err = new CustomError('test')
    expect(err).toBeInstanceOf(CustomError)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('CustomError')
  })
})

describe('NotFoundError', () => {
  it('should be an instance of AppError and Error', () => {
    const err = new NotFoundError('Goal', '123')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(NotFoundError)
  })

  it('should set NOT_FOUND code', () => {
    const err = new NotFoundError('Task', '456')
    expect(err.code).toBe(ErrorCode.NOT_FOUND)
  })

  it('should format message with resource type and identifier', () => {
    const err = new NotFoundError('Goal', 'abc-123')
    expect(err.message).toBe('Goal not found: abc-123')
  })

  it('should include resourceType and identifier in context', () => {
    const err = new NotFoundError('Skill', 'cache_optimize')
    expect(err.context?.resourceType).toBe('Skill')
    expect(err.context?.identifier).toBe('cache_optimize')
  })

  it('should merge additional context', () => {
    const err = new NotFoundError('Agent', 'agent-1', { operation: 'execute' })
    expect(err.context?.resourceType).toBe('Agent')
    expect(err.context?.identifier).toBe('agent-1')
    expect(err.context?.operation).toBe('execute')
  })

  it('should set name to NotFoundError', () => {
    const err = new NotFoundError('X', '1')
    expect(err.name).toBe('NotFoundError')
  })
})

describe('AlreadyExistsError', () => {
  it('should set ALREADY_EXISTS code', () => {
    const err = new AlreadyExistsError('Policy', 'deny-all')
    expect(err.code).toBe(ErrorCode.ALREADY_EXISTS)
  })

  it('should format message correctly', () => {
    const err = new AlreadyExistsError('Skill', 'data_cleanup')
    expect(err.message).toBe('Skill already exists: data_cleanup')
  })

  it('should include resource type and identifier in context', () => {
    const err = new AlreadyExistsError('Policy', 'p1')
    expect(err.context?.resourceType).toBe('Policy')
    expect(err.context?.identifier).toBe('p1')
  })

  it('should be catchable as AppError', () => {
    try {
      throw new AlreadyExistsError('Skill', 'test')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe(ErrorCode.ALREADY_EXISTS)
    }
  })
})

describe('ValidationError', () => {
  it('should set INVALID_INPUT code', () => {
    const err = new ValidationError('Invalid parameter')
    expect(err.code).toBe(ErrorCode.INVALID_INPUT)
  })

  it('should set message correctly', () => {
    const err = new ValidationError('todoId is required')
    expect(err.message).toBe('todoId is required')
  })

  it('should accept context', () => {
    const err = new ValidationError('bad input', { field: 'name', value: null })
    expect(err.context).toEqual({ field: 'name', value: null })
  })
})

describe('StateTransitionError', () => {
  it('should set INVALID_STATE_TRANSITION code', () => {
    const err = new StateTransitionError('initializing', 'running')
    expect(err.code).toBe(ErrorCode.INVALID_STATE_TRANSITION)
  })

  it('should format message with arrow notation', () => {
    const err = new StateTransitionError('paused', 'draining')
    expect(err.message).toBe('Invalid state transition: paused → draining')
  })

  it('should include from and to states in context', () => {
    const err = new StateTransitionError('stopped', 'running')
    expect(err.context?.fromState).toBe('stopped')
    expect(err.context?.toState).toBe('running')
  })
})

describe('PolicyViolationError', () => {
  it('should set POLICY_VIOLATION code', () => {
    const err = new PolicyViolationError('deny-all', 'Action forbidden')
    expect(err.code).toBe(ErrorCode.POLICY_VIOLATION)
  })

  it('should format message with policy name and reason', () => {
    const err = new PolicyViolationError(
      'max-actions',
      'Limit reached: 100/100',
    )
    expect(err.message).toBe(
      "Policy 'max-actions' violated: Limit reached: 100/100",
    )
  })

  it('should include policy name and reason in context', () => {
    const err = new PolicyViolationError('p1', 'denied')
    expect(err.context?.policyName).toBe('p1')
    expect(err.context?.reason).toBe('denied')
  })
})

describe('BudgetExceededError', () => {
  it('should set BUDGET_EXCEEDED code', () => {
    const err = new BudgetExceededError('actions', 150, 100)
    expect(err.code).toBe(ErrorCode.BUDGET_EXCEEDED)
  })

  it('should format message with dimension, used, and limit', () => {
    const err = new BudgetExceededError('memory_mb', 256, 128)
    expect(err.message).toBe('Budget exceeded for memory_mb: 256/128')
  })

  it('should include dimension, used, and limit in context', () => {
    const err = new BudgetExceededError('duration_ms', 5000, 3000)
    expect(err.context?.dimension).toBe('duration_ms')
    expect(err.context?.used).toBe(5000)
    expect(err.context?.limit).toBe(3000)
  })
})

describe('UnsupportedOperationError', () => {
  it('should set UNSUPPORTED_OPERATION code', () => {
    const err = new UnsupportedOperationError('delete_all')
    expect(err.code).toBe(ErrorCode.UNSUPPORTED_OPERATION)
  })

  it('should format message with operation name', () => {
    const err = new UnsupportedOperationError('unknown_action_type')
    expect(err.message).toBe('Unsupported operation: unknown_action_type')
  })

  it('should include operation in context', () => {
    const err = new UnsupportedOperationError('op1')
    expect(err.context?.operation).toBe('op1')
  })
})

describe('ConfigError', () => {
  it('should default to CONFIG_VALIDATION_FAILED code', () => {
    const err = new ConfigError('Invalid config')
    expect(err.code).toBe(ErrorCode.CONFIG_VALIDATION_FAILED)
  })

  it('should accept custom code', () => {
    const err = new ConfigError('Load failed', ErrorCode.CONFIG_LOAD_FAILED)
    expect(err.code).toBe(ErrorCode.CONFIG_LOAD_FAILED)
  })

  it('should set message correctly', () => {
    const err = new ConfigError('Missing required field: database.host')
    expect(err.message).toBe('Missing required field: database.host')
  })
})

describe('error hierarchy and catchability', () => {
  it('should catch all custom errors as AppError', () => {
    const errors = [
      new NotFoundError('A', '1'),
      new AlreadyExistsError('B', '2'),
      new ValidationError('bad'),
      new StateTransitionError('s1', 's2'),
      new PolicyViolationError('p', 'r'),
      new BudgetExceededError('d', 1, 2),
      new UnsupportedOperationError('op'),
      new ConfigError('cfg'),
    ]

    for (const err of errors) {
      try {
        throw err
      } catch (caught) {
        expect(caught).toBeInstanceOf(AppError)
        expect(caught).toBeInstanceOf(Error)
      }
    }
  })

  it('should distinguish error types by code', () => {
    const notFound = new NotFoundError('X', '1')
    const alreadyExists = new AlreadyExistsError('X', '1')

    expect(notFound.code).toBe(ErrorCode.NOT_FOUND)
    expect(alreadyExists.code).toBe(ErrorCode.ALREADY_EXISTS)
    expect(notFound.code).not.toBe(alreadyExists.code)
  })

  it('should distinguish error types by instanceof', () => {
    const notFound = new NotFoundError('X', '1')
    const validation = new ValidationError('bad')

    expect(notFound).toBeInstanceOf(NotFoundError)
    expect(notFound).not.toBeInstanceOf(ValidationError)
    expect(validation).toBeInstanceOf(ValidationError)
    expect(validation).not.toBeInstanceOf(NotFoundError)
  })

  it('should support programmatic error handling', () => {
    function handleError(err: unknown): string {
      if (err instanceof AppError) {
        switch (err.code) {
          case ErrorCode.NOT_FOUND:
            return 'Resource not found'
          case ErrorCode.ALREADY_EXISTS:
            return 'Resource already exists'
          case ErrorCode.INVALID_INPUT:
            return 'Invalid input'
          default:
            return `Error: ${err.code}`
        }
      }
      return 'Unknown error'
    }

    expect(handleError(new NotFoundError('A', '1'))).toBe('Resource not found')
    expect(handleError(new AlreadyExistsError('B', '2'))).toBe(
      'Resource already exists',
    )
    expect(handleError(new ValidationError('bad'))).toBe('Invalid input')
    expect(handleError(new Error('plain'))).toBe('Unknown error')
  })
})
