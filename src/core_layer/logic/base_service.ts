import { AppError, ErrorCode } from '../model/errors.js'
import type { Logger } from './logger.js'

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenTimeoutMs: number
}

export abstract class BaseService {
  protected logger: Logger
  protected circuitBreakerState: CircuitBreakerState
  protected circuitBreakerFailureCount: number
  protected circuitBreakerLastFailureTime: number
  protected circuitBreakerConfig: CircuitBreakerConfig

  constructor(
    logger: Logger,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
  ) {
    this.logger = logger
    this.circuitBreakerState = CircuitBreakerState.CLOSED
    this.circuitBreakerFailureCount = 0
    this.circuitBreakerLastFailureTime = 0
    this.circuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenTimeoutMs: 5000,
      ...circuitBreakerConfig,
    }
    this.logger.trace(
      'BaseService initialized',
      { circuitBreakerConfig: this.circuitBreakerConfig },
      28,
      'constructor',
    )
  }

  protected isCircuitBreakerClosed(): boolean {
    this.logger.trace(
      'BaseService.isCircuitBreakerClosed called',
      { state: this.circuitBreakerState },
      32,
      'isCircuitBreakerClosed',
    )
    return this.circuitBreakerState === CircuitBreakerState.CLOSED
  }

  protected isCircuitBreakerOpen(): boolean {
    this.logger.trace(
      'BaseService.isCircuitBreakerOpen called',
      { state: this.circuitBreakerState },
      37,
      'isCircuitBreakerOpen',
    )
    const now = Date.now()
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      const elapsed = now - this.circuitBreakerLastFailureTime
      if (elapsed > this.circuitBreakerConfig.resetTimeoutMs) {
        this.logger.trace(
          'Circuit breaker transitioning to HALF_OPEN',
          { elapsed, timeout: this.circuitBreakerConfig.resetTimeoutMs },
          43,
          'isCircuitBreakerOpen',
        )
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN
      }
    }
    return this.circuitBreakerState === CircuitBreakerState.OPEN
  }

  protected recordSuccess(): void {
    this.logger.trace(
      'BaseService.recordSuccess called',
      {},
      50,
      'recordSuccess',
    )
    this.circuitBreakerFailureCount = 0
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreakerState = CircuitBreakerState.CLOSED
      this.logger.trace(
        'Circuit breaker reset to CLOSED',
        {},
        54,
        'recordSuccess',
      )
    }
  }

  protected recordFailure(): void {
    this.logger.trace(
      'BaseService.recordFailure called',
      {},
      58,
      'recordFailure',
    )
    this.circuitBreakerFailureCount++
    this.circuitBreakerLastFailureTime = Date.now()

    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreakerState = CircuitBreakerState.OPEN
      this.logger.trace(
        'Circuit breaker transitioned back to OPEN from HALF_OPEN',
        {},
        64,
        'recordFailure',
      )
    } else if (
      this.circuitBreakerState === CircuitBreakerState.CLOSED &&
      this.circuitBreakerFailureCount >=
        this.circuitBreakerConfig.failureThreshold
    ) {
      this.circuitBreakerState = CircuitBreakerState.OPEN
      this.logger.trace(
        'Circuit breaker opened',
        {
          failureCount: this.circuitBreakerFailureCount,
          threshold: this.circuitBreakerConfig.failureThreshold,
        },
        69,
        'recordFailure',
      )
    }
  }

  protected async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    this.logger.trace(
      'BaseService.executeWithCircuitBreaker called',
      {},
      73,
      'executeWithCircuitBreaker',
    )

    if (this.isCircuitBreakerOpen()) {
      this.logger.error(
        'Circuit breaker is OPEN, rejecting operation',
        {},
        76,
        'executeWithCircuitBreaker',
      )
      throw new AppError(
        'Circuit breaker is OPEN, service unavailable',
        ErrorCode.CIRCUIT_BREAKER_OPEN,
      )
    }

    try {
      const result = await operation()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  abstract initialize(): Promise<void>
  abstract execute(): Promise<void>
  abstract shutdown(): Promise<void>
}
