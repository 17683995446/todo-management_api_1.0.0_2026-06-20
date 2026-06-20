import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Watchdog } from '../../src/agent_layer/enhancement/watchdog.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('Watchdog', () => {
  let logger: ConsoleLogger
  let config: AppConfig

  beforeEach(() => {
    vi.useFakeTimers()
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'wd-test')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start and stop', () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    expect(wd.isRunning()).toBe(false)

    wd.start()
    expect(wd.isRunning()).toBe(true)

    wd.stop()
    expect(wd.isRunning()).toBe(false)
  })

  it('should not start twice', () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.start()
    wd.start() // should not throw
    expect(wd.isRunning()).toBe(true)
    wd.stop()
  })

  it('should stop safely when not running', () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.stop() // should not throw
    expect(wd.isRunning()).toBe(false)
  })

  it('should report healthy when no check callback registered', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    const health = await wd.checkHealth()

    expect(health.healthy).toBe(true)
    expect(health.consecutiveFailures).toBe(0)
  })

  it('should report healthy when check callback returns true', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.onCheck(async () => true)

    const health = await wd.checkHealth()
    expect(health.healthy).toBe(true)
  })

  it('should report unhealthy when check callback returns false', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.onCheck(async () => false)

    const health = await wd.checkHealth()
    expect(health.healthy).toBe(false)
    expect(health.failureReason).toBeDefined()
    expect(health.consecutiveFailures).toBe(1)
  })

  it('should report unhealthy when check callback throws', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.onCheck(async () => {
      throw new Error('check failed')
    })

    const health = await wd.checkHealth()
    expect(health.healthy).toBe(false)
    expect(health.failureReason).toBe('check failed')
  })

  it('should track consecutive failures', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 5 })
    wd.onCheck(async () => false)

    await wd.checkHealth()
    await wd.checkHealth()
    await wd.checkHealth()

    const health = await wd.checkHealth()
    expect(health.consecutiveFailures).toBe(4)
  })

  it('should reset consecutive failures on healthy check', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 5 })
    let healthy = false
    wd.onCheck(async () => healthy)

    await wd.checkHealth() // fail
    await wd.checkHealth() // fail
    expect(wd.getStats().consecutiveFailures).toBe(2)

    healthy = true
    await wd.checkHealth() // success
    expect(wd.getStats().consecutiveFailures).toBe(0)
  })

  it('should trigger recovery after max consecutive failures', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.onCheck(async () => false)

    let recoveryCalled = false
    wd.onRecover(async () => {
      recoveryCalled = true
    })

    await wd.checkHealth() // fail 1
    await wd.checkHealth() // fail 2
    expect(recoveryCalled).toBe(false)

    await wd.checkHealth() // fail 3 → trigger recovery
    expect(recoveryCalled).toBe(true)
    expect(wd.getStats().recoveryCount).toBe(1)
  })

  it('should reset failures after successful recovery', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 2 })
    wd.onCheck(async () => false)
    wd.onRecover(async () => {
      // recovery succeeds
    })

    await wd.checkHealth() // fail 1
    await wd.checkHealth() // fail 2 → recovery
    expect(wd.getStats().consecutiveFailures).toBe(0)
    expect(wd.getStats().recoveryCount).toBe(1)
  })

  it('should not reset failures after failed recovery', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 2 })
    wd.onCheck(async () => false)
    wd.onRecover(async () => {
      throw new Error('recovery failed')
    })

    await wd.checkHealth() // fail 1
    await wd.checkHealth() // fail 2 → recovery attempt (fails)
    expect(wd.getStats().consecutiveFailures).toBe(2)
    expect(wd.getStats().recoveryCount).toBe(1)
  })

  it('should support manual recovery trigger', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    let recoveryCalled = false
    wd.onRecover(async () => {
      recoveryCalled = true
    })

    await wd.triggerRecovery()
    expect(recoveryCalled).toBe(true)
    expect(wd.getStats().recoveryCount).toBe(1)
  })

  it('should prevent re-entrant recovery', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 50, maxConsecutiveFailures: 1 })
    let callCount = 0
    wd.onCheck(async () => false)
    wd.onRecover(async () => {
      callCount++
      // Simulate slow recovery (200ms, longer than interval)
      await new Promise((r) => setTimeout(r, 200))
    })

    wd.start()
    // First check at 50ms: fail → recovery starts (200ms, completes at 250ms)
    await vi.advanceTimersByTimeAsync(55)
    // Second check at 100ms: fail → recovery in progress, skip
    await vi.advanceTimersByTimeAsync(50)
    // Third check at 150ms: fail → recovery in progress, skip
    await vi.advanceTimersByTimeAsync(50)
    // Fourth check at 200ms: fail → recovery in progress, skip
    await vi.advanceTimersByTimeAsync(50)
    // Stop before recovery completes (at 250ms)
    wd.stop()

    // Should only have called recovery once (others were skipped)
    expect(callCount).toBe(1)
  })

  it('should track stats correctly', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    let healthy = true
    wd.onCheck(async () => healthy)

    await wd.checkHealth() // healthy
    await wd.checkHealth() // healthy
    healthy = false
    await wd.checkHealth() // unhealthy

    const stats = wd.getStats()
    expect(stats.totalChecks).toBe(3)
    expect(stats.healthyChecks).toBe(2)
    expect(stats.consecutiveFailures).toBe(1)
    expect(stats.lastCheckAt).toBeDefined()
  })

  it('should run periodic checks via timer', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 50, maxConsecutiveFailures: 5 })
    let checkCount = 0
    wd.onCheck(async () => {
      checkCount++
      return true
    })

    wd.start()
    await vi.advanceTimersByTimeAsync(120) // ~2 checks
    wd.stop()

    expect(checkCount).toBeGreaterThanOrEqual(2)
  })

  it('should stop periodic checks when stopped', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 50, maxConsecutiveFailures: 5 })
    let checkCount = 0
    wd.onCheck(async () => {
      checkCount++
      return true
    })

    wd.start()
    await vi.advanceTimersByTimeAsync(60) // ~1 check
    wd.stop()
    const countAfterStop = checkCount

    await vi.advanceTimersByTimeAsync(100) // no more checks
    expect(checkCount).toBe(countAfterStop)
  })

  it('should handle recovery callback not registered', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 1 })
    wd.onCheck(async () => false)

    // Should not throw even without recovery callback
    await wd.checkHealth()
    expect(wd.getStats().recoveryCount).toBe(1)
  })

  it('should handle check callback errors gracefully', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 1000, maxConsecutiveFailures: 3 })
    wd.onCheck(async () => {
      throw new Error('callback error')
    })

    const health = await wd.checkHealth()
    expect(health.healthy).toBe(false)
    expect(health.failureReason).toBe('callback error')
    expect(wd.getStats().totalChecks).toBe(1)
  })

  it('should not crash on timer errors', async () => {
    const wd = new Watchdog(logger, { checkIntervalMs: 50, maxConsecutiveFailures: 3 })
    let callCount = 0
    wd.onCheck(async () => {
      callCount++
      if (callCount === 1) throw new Error('transient')
      return true
    })

    wd.start()
    await vi.advanceTimersByTimeAsync(120)
    wd.stop()

    // Should have continued checking after the error
    expect(callCount).toBeGreaterThanOrEqual(2)
  })
})
