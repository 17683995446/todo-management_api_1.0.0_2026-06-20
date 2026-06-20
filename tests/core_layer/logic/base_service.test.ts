import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BaseService, CircuitBreakerState } from '../../../src/core_layer/logic/base_service.js'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'

class TestService extends BaseService {
  async initialize(): Promise<void> {}
  async execute(): Promise<void> {}
  async shutdown(): Promise<void> {}

  public async testExecuteWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    return this.executeWithCircuitBreaker(operation)
  }

  public getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreakerState
  }
}

describe('BaseService Circuit Breaker', () => {
  let testService: TestService
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rateLimit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'test-service')
    testService = new TestService(logger, {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenTimeoutMs: 500
    })
  })

  it('should initialize with closed circuit', () => {
    expect(testService.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED)
  })

  it('should execute operation successfully when circuit is closed', async () => {
    const operation = async () => 'success'
    const result = await testService.testExecuteWithCircuitBreaker(operation)
    expect(result).toBe('success')
    expect(testService.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED)
  })

  it('should open circuit after failure threshold is reached', async () => {
    const failingOperation = async () => {
      throw new Error('Operation failed')
    }

    // First two failures should not open the circuit
    await expect(testService.testExecuteWithCircuitBreaker(failingOperation)).rejects.toThrow()
    await expect(testService.testExecuteWithCircuitBreaker(failingOperation)).rejects.toThrow()
    expect(testService.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED)

    // Third failure should open the circuit
    await expect(testService.testExecuteWithCircuitBreaker(failingOperation)).rejects.toThrow()
    expect(testService.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN)

    // Now circuit should be open and reject immediately
    await expect(testService.testExecuteWithCircuitBreaker(async () => 'success')).rejects.toThrow('Circuit breaker is OPEN')
  })

  it('should transition to half-open after reset timeout and execute successfully', async () => {
    const failingOperation = async () => {
      throw new Error('Operation failed')
    }

    // Fail enough times to open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(testService.testExecuteWithCircuitBreaker(failingOperation)).rejects.toThrow()
    }
    expect(testService.getCircuitBreakerState()).toBe(CircuitBreakerState.OPEN)

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 1100))
    
    // Now the isCircuitBreakerOpen() will transition to HALF_OPEN and return false, allowing operation
    const result = await testService.testExecuteWithCircuitBreaker(async () => 'success')
    expect(result).toBe('success')
    expect(testService.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED)
  })

  it('should reset circuit to closed on success in half-open state', async () => {
    // We need a way to directly test this behavior
    // Let's create a new test to verify the recordSuccess method in HALF_OPEN state
    const service = new TestService(logger, { failureThreshold: 2, resetTimeoutMs: 100, halfOpenTimeoutMs: 50 })
    
    // Open the circuit first
    const failingOp = async () => { throw new Error('fail') }
    for (let i = 0; i < 2; i++) {
      await expect(service.testExecuteWithCircuitBreaker(failingOp)).rejects.toThrow()
    }
    
    // Manually set to HALF_OPEN state for testing
    service.circuitBreakerState = CircuitBreakerState.HALF_OPEN
    
    // Execute successful operation
    const result = await service.testExecuteWithCircuitBreaker(async () => 'success')
    expect(result).toBe('success')
    expect(service.getCircuitBreakerState()).toBe(CircuitBreakerState.CLOSED)
  })
})
