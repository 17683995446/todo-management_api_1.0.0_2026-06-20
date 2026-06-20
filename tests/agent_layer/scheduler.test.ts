import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerAgentScheduler } from '../../src/agent_layer/core/scheduler.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('TimerAgentScheduler', () => {
  let scheduler: TimerAgentScheduler
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
    const logger = new ConsoleLogger(config, 'scheduler-test')
    scheduler = new TimerAgentScheduler(logger, { intervalMs: 1000 }) // 1 second interval
  })

  afterEach(() => {
    scheduler.stop()
    vi.useRealTimers()
  })

  it('should not be running initially', () => {
    expect(scheduler.isRunning()).toBe(false)
  })

  it('should be running after start', () => {
    scheduler.start()
    expect(scheduler.isRunning()).toBe(true)
  })

  it('should not be running after stop', () => {
    scheduler.start()
    scheduler.stop()
    expect(scheduler.isRunning()).toBe(false)
  })

  it('should call trigger callback on interval', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    scheduler.onTrigger(callback)
    scheduler.start()

    // Advance time by 1 second (one interval)
    await vi.advanceTimersByTimeAsync(1000)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should call trigger callback multiple times', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    scheduler.onTrigger(callback)
    scheduler.start()

    await vi.advanceTimersByTimeAsync(3000) // 3 intervals

    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('should not trigger after stop', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    scheduler.onTrigger(callback)
    scheduler.start()

    await vi.advanceTimersByTimeAsync(1000)
    scheduler.stop()
    await vi.advanceTimersByTimeAsync(2000)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should prevent re-entrancy when callback is slow', async () => {
    let resolvePromise: (() => void) | undefined
    const slowCallback = vi.fn().mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolvePromise = resolve
      })
    })

    scheduler.onTrigger(slowCallback)
    scheduler.start()

    // First trigger
    await vi.advanceTimersByTimeAsync(1000)
    expect(slowCallback).toHaveBeenCalledTimes(1)

    // Second trigger while first is still running - should be skipped
    await vi.advanceTimersByTimeAsync(1000)
    expect(slowCallback).toHaveBeenCalledTimes(1) // still 1

    // Resolve the first callback
    resolvePromise?.()

    // Third trigger - should now execute
    await vi.advanceTimersByTimeAsync(1000)
    expect(slowCallback).toHaveBeenCalledTimes(2)
  })

  it('should handle callback errors gracefully', async () => {
    const errorCallback = vi.fn().mockRejectedValue(new Error('Test error'))
    scheduler.onTrigger(errorCallback)
    scheduler.start()

    // Should not throw
    await vi.advanceTimersByTimeAsync(1000)

    expect(errorCallback).toHaveBeenCalledTimes(1)
    // Scheduler should still be running
    expect(scheduler.isRunning()).toBe(true)
  })

  it('should warn when started twice', () => {
    scheduler.start()
    scheduler.start() // should not throw, just warn
    expect(scheduler.isRunning()).toBe(true)
  })

  it('should do nothing when stopping if not started', () => {
    expect(() => scheduler.stop()).not.toThrow()
  })

  it('should warn when triggered without callback', async () => {
    // No callback registered
    await scheduler.trigger()
    // Should not throw
  })

  it('should trigger manually via trigger()', async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    scheduler.onTrigger(callback)

    // Manual trigger without starting the timer
    await scheduler.trigger()

    expect(callback).toHaveBeenCalledTimes(1)
  })
})
