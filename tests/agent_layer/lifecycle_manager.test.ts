import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LifecycleManager } from '../../src/agent_layer/governance/lifecycle_manager.js'
import {
  VALID_TRANSITIONS,
  isValidTransition,
} from '../../src/agent_layer/model/lifecycle.js'
import type {
  LifecycleEventType,
  LifecycleState,
} from '../../src/agent_layer/model/lifecycle.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('LifecycleManager', () => {
  let logger: ConsoleLogger
  let config: AppConfig

  beforeEach(() => {
    config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 },
    }
    logger = new ConsoleLogger(config, 'lifecycle-test')
  })

  describe('initial state', () => {
    it('should start in initializing state', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.getState()).toBe('initializing')
    })

    it('should not be running initially', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.isRunning()).toBe(false)
    })

    it('should not be executable initially', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.canExecute()).toBe(false)
    })

    it('should have empty transition history initially', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.getHistory()).toHaveLength(0)
    })

    it('should have zero cycle count initially', () => {
      const lm = new LifecycleManager(logger)
      const snapshot = lm.getSnapshot()
      expect(snapshot.cycleCount).toBe(0)
    })
  })

  describe('valid transitions', () => {
    it('should transition initializing → ready', () => {
      const lm = new LifecycleManager(logger)
      const t = lm.transition('ready')
      expect(t.from).toBe('initializing')
      expect(t.to).toBe('ready')
      expect(lm.getState()).toBe('ready')
    })

    it('should transition ready → running', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      const t = lm.transition('start')
      expect(t.from).toBe('ready')
      expect(t.to).toBe('running')
      expect(lm.isRunning()).toBe(true)
      expect(lm.canExecute()).toBe(true)
    })

    it('should transition running → paused', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const t = lm.transition('pause')
      expect(t.from).toBe('running')
      expect(t.to).toBe('paused')
      expect(lm.isRunning()).toBe(false)
      expect(lm.canExecute()).toBe(false)
    })

    it('should transition paused → running (resume)', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('pause')
      const t = lm.transition('resume')
      expect(t.from).toBe('paused')
      expect(t.to).toBe('running')
      expect(lm.isRunning()).toBe(true)
    })

    it('should transition running → draining', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const t = lm.transition('drain')
      expect(t.from).toBe('running')
      expect(t.to).toBe('draining')
      // draining 状态仍可执行（完成当前循环）
      expect(lm.canExecute()).toBe(true)
      expect(lm.isRunning()).toBe(false)
    })

    it('should transition draining → stopped', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('drain')
      const t = lm.transition('stop')
      expect(t.from).toBe('draining')
      expect(t.to).toBe('stopped')
      expect(lm.canExecute()).toBe(false)
    })

    it('should transition running → failed', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const t = lm.transition('fail', 'critical error')
      expect(t.from).toBe('running')
      expect(t.to).toBe('failed')
      expect(t.reason).toBe('critical error')
      expect(lm.canExecute()).toBe(false)
    })

    it('should transition failed → recovering', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail')
      const t = lm.transition('recover')
      expect(t.from).toBe('failed')
      expect(t.to).toBe('recovering')
    })

    it('should transition recovering → running', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail')
      lm.transition('recover')
      const t = lm.transition('start')
      expect(t.from).toBe('recovering')
      expect(t.to).toBe('running')
      expect(lm.isRunning()).toBe(true)
    })

    it('should transition initializing → failed', () => {
      const lm = new LifecycleManager(logger)
      const t = lm.transition('fail', 'init error')
      expect(t.from).toBe('initializing')
      expect(t.to).toBe('failed')
    })

    it('should transition ready → stopped', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      const t = lm.transition('stop')
      expect(t.from).toBe('ready')
      expect(t.to).toBe('stopped')
    })

    it('should transition paused → stopped', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('pause')
      const t = lm.transition('stop')
      expect(t.from).toBe('paused')
      expect(t.to).toBe('stopped')
    })

    it('should transition running → stopped (force stop)', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const t = lm.transition('stop', 'force stop')
      expect(t.from).toBe('running')
      expect(t.to).toBe('stopped')
    })

    it('should transition failed → stopped', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail')
      const t = lm.transition('stop')
      expect(t.from).toBe('failed')
      expect(t.to).toBe('stopped')
    })

    it('should transition stopped → initializing (restart)', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('stop')
      const t = lm.transition('initialize')
      expect(t.from).toBe('stopped')
      expect(t.to).toBe('initializing')
    })
  })

  describe('invalid transitions', () => {
    it('should throw on invalid transition initializing → running', () => {
      const lm = new LifecycleManager(logger)
      expect(() => lm.transition('start')).toThrow(/Invalid state transition/)
    })

    it('should throw on invalid transition ready → paused', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      expect(() => lm.transition('pause')).toThrow(/Invalid state transition/)
    })

    it('should throw on invalid transition paused → draining', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('pause')
      expect(() => lm.transition('drain')).toThrow(/Invalid state transition/)
    })

    it('should throw on invalid transition stopped → running', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('stop')
      expect(() => lm.transition('start')).toThrow(/Invalid state transition/)
    })

    it('should throw on invalid transition draining → running', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('drain')
      expect(() => lm.transition('start')).toThrow(/Invalid state transition/)
    })

    it('should throw on invalid transition failed → running', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail')
      expect(() => lm.transition('start')).toThrow(/Invalid state transition/)
    })

    it('should throw on invalid transition recovering → paused', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail')
      lm.transition('recover')
      expect(() => lm.transition('pause')).toThrow(/Invalid state transition/)
    })

    it('should include from/to states and event in error', () => {
      const lm = new LifecycleManager(logger)
      let errorMsg = ''
      let errorContext: Record<string, unknown> | undefined
      try {
        lm.transition('start')
      } catch (e) {
        errorMsg = (e as Error).message
        errorContext = (e as { context?: Record<string, unknown> }).context
      }
      expect(errorMsg).toContain('initializing')
      expect(errorMsg).toContain('running')
      expect(errorContext?.event).toBe('start')
    })
  })

  describe('canTransition', () => {
    it('should return true for valid next states', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.canTransition('ready')).toBe(true)
      expect(lm.canTransition('failed')).toBe(true)
    })

    it('should return false for invalid next states', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.canTransition('running')).toBe(false)
      expect(lm.canTransition('paused')).toBe(false)
      expect(lm.canTransition('stopped')).toBe(false)
    })

    it('should reflect current state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      expect(lm.canTransition('running')).toBe(true)
      expect(lm.canTransition('stopped')).toBe(true)
      expect(lm.canTransition('paused')).toBe(false)
    })
  })

  describe('getValidNextStates', () => {
    it('should return valid transitions for initializing', () => {
      const lm = new LifecycleManager(logger)
      const next = lm.getValidNextStates()
      expect(next).toEqual(VALID_TRANSITIONS.initializing)
    })

    it('should return valid transitions for running', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const next = lm.getValidNextStates()
      expect(next).toEqual(VALID_TRANSITIONS.running)
      expect(next).toContain('paused')
      expect(next).toContain('draining')
      expect(next).toContain('failed')
      expect(next).toContain('stopped')
    })

    it('should return empty array for terminal stopped state if no transitions', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('stop')
      const next = lm.getValidNextStates()
      // stopped → initializing is allowed (restart)
      expect(next).toEqual(['initializing'])
    })
  })

  describe('canExecute', () => {
    it('should be executable in running state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      expect(lm.canExecute()).toBe(true)
    })

    it('should be executable in draining state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('drain')
      expect(lm.canExecute()).toBe(true)
    })

    it('should not be executable in initializing state', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.canExecute()).toBe(false)
    })

    it('should not be executable in paused state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('pause')
      expect(lm.canExecute()).toBe(false)
    })

    it('should not be executable in failed state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail')
      expect(lm.canExecute()).toBe(false)
    })

    it('should not be executable in stopped state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('stop')
      expect(lm.canExecute()).toBe(false)
    })
  })

  describe('recordCycle', () => {
    it('should increment cycle count', () => {
      const lm = new LifecycleManager(logger)
      lm.recordCycle()
      lm.recordCycle()
      lm.recordCycle()
      expect(lm.getSnapshot().cycleCount).toBe(3)
    })

    it('should track cycle count across state transitions', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.recordCycle()
      lm.recordCycle()
      lm.transition('pause')
      lm.recordCycle() // even in paused, recordCycle still works
      expect(lm.getSnapshot().cycleCount).toBe(3)
    })
  })

  describe('getHistory', () => {
    it('should record all transitions in history', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('pause')
      lm.transition('resume')
      const history = lm.getHistory()
      expect(history).toHaveLength(4)
      expect(history[0].from).toBe('initializing')
      expect(history[0].to).toBe('ready')
      expect(history[3].from).toBe('paused')
      expect(history[3].to).toBe('running')
    })

    it('should record reason when provided', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready', 'system ready')
      lm.transition('start', 'user triggered')
      const history = lm.getHistory()
      expect(history[0].reason).toBe('system ready')
      expect(history[1].reason).toBe('user triggered')
    })

    it('should record timestamps as ISO strings', () => {
      const lm = new LifecycleManager(logger)
      const before = new Date().toISOString()
      lm.transition('ready')
      const after = new Date().toISOString()
      const history = lm.getHistory()
      expect(history[0].timestamp).toBeTruthy()
      // timestamp should be parseable as date
      const ts = new Date(history[0].timestamp)
      expect(ts.getTime()).not.toBeNaN()
      // should be in valid range
      expect(history[0].timestamp >= before).toBe(true)
      expect(history[0].timestamp <= after).toBe(true)
    })

    it('should return a copy of history (immutability)', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      const history1 = lm.getHistory()
      const history2 = lm.getHistory()
      expect(history1).not.toBe(history2)
      expect(history1).toEqual(history2)
      // mutating one should not affect the other
      history1.push({
        from: 'ready',
        to: 'running',
        event: 'start',
        timestamp: 'fake',
        reason: 'fake',
      })
      expect(lm.getHistory()).toHaveLength(1)
    })
  })

  describe('getSnapshot', () => {
    it('should return current state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      const snapshot = lm.getSnapshot()
      expect(snapshot.currentState).toBe('ready')
    })

    it('should return previous state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const snapshot = lm.getSnapshot()
      expect(snapshot.previousState).toBe('ready')
    })

    it('should have undefined previousState initially', () => {
      const lm = new LifecycleManager(logger)
      const snapshot = lm.getSnapshot()
      expect(snapshot.previousState).toBeUndefined()
    })

    it('should return enteredAt as ISO string', () => {
      const lm = new LifecycleManager(logger)
      const snapshot = lm.getSnapshot()
      expect(snapshot.enteredAt).toBeTruthy()
      const ts = new Date(snapshot.enteredAt)
      expect(ts.getTime()).not.toBeNaN()
    })

    it('should track total uptime when in running state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      // 让运行时长累积一点
      const snapshot1 = lm.getSnapshot()
      // 等待一小段时间
      const start = Date.now()
      while (Date.now() - start < 5) {
        // busy wait 5ms
      }
      const snapshot2 = lm.getSnapshot()
      expect(snapshot2.totalUptimeMs).toBeGreaterThanOrEqual(
        snapshot1.totalUptimeMs,
      )
      expect(snapshot2.totalUptimeMs).toBeGreaterThan(0)
    })

    it('should track paused time when in paused state', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('pause')
      const start = Date.now()
      while (Date.now() - start < 5) {
        // busy wait 5ms
      }
      const snapshot = lm.getSnapshot()
      expect(snapshot.totalPausedMs).toBeGreaterThan(0)
    })

    it('should not increment uptime when paused', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const start1 = Date.now()
      while (Date.now() - start1 < 5) {
        // busy wait 5ms
      }
      const uptimeBefore = lm.getSnapshot().totalUptimeMs
      lm.transition('pause')
      const start2 = Date.now()
      while (Date.now() - start2 < 10) {
        // busy wait 10ms
      }
      const uptimeAfter = lm.getSnapshot().totalUptimeMs
      // 暂停期间 uptime 不应增长
      expect(uptimeAfter).toBeGreaterThanOrEqual(uptimeBefore)
      // uptime 增长不应超过暂停时长（允许少量误差）
      expect(uptimeAfter - uptimeBefore).toBeLessThan(10)
    })

    it('should accumulate uptime across multiple running periods', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const start1 = Date.now()
      while (Date.now() - start1 < 5) {
        // busy wait
      }
      lm.transition('pause')
      const uptime1 = lm.getSnapshot().totalUptimeMs
      expect(uptime1).toBeGreaterThan(0)

      lm.transition('resume')
      const start2 = Date.now()
      while (Date.now() - start2 < 5) {
        // busy wait
      }
      lm.transition('pause')
      const uptime2 = lm.getSnapshot().totalUptimeMs
      expect(uptime2).toBeGreaterThan(uptime1)
    })

    it('should include cycle count in snapshot', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.recordCycle()
      lm.recordCycle()
      const snapshot = lm.getSnapshot()
      expect(snapshot.cycleCount).toBe(2)
    })

    it('should include transition history in snapshot', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      const snapshot = lm.getSnapshot()
      expect(snapshot.transitionHistory).toHaveLength(2)
    })
  })

  describe('full lifecycle scenario', () => {
    it('should handle complete lifecycle: init → ready → running → paused → running → drain → stopped', () => {
      const lm = new LifecycleManager(logger)
      expect(lm.getState()).toBe('initializing')

      lm.transition('ready')
      expect(lm.getState()).toBe('ready')

      lm.transition('start')
      expect(lm.getState()).toBe('running')
      expect(lm.canExecute()).toBe(true)

      lm.transition('pause')
      expect(lm.getState()).toBe('paused')
      expect(lm.canExecute()).toBe(false)

      lm.transition('resume')
      expect(lm.getState()).toBe('running')

      lm.transition('drain')
      expect(lm.getState()).toBe('draining')
      expect(lm.canExecute()).toBe(true)

      lm.transition('stop')
      expect(lm.getState()).toBe('stopped')
      expect(lm.canExecute()).toBe(false)

      const history = lm.getHistory()
      expect(history).toHaveLength(6)
    })

    it('should handle failure and recovery scenario', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('fail', 'crash')
      expect(lm.getState()).toBe('failed')
      expect(lm.canExecute()).toBe(false)

      lm.transition('recover')
      expect(lm.getState()).toBe('recovering')

      lm.transition('start')
      expect(lm.getState()).toBe('running')
      expect(lm.canExecute()).toBe(true)

      const history = lm.getHistory()
      // ready, start, fail, recover, start = 5 transitions
      expect(history).toHaveLength(5)
      expect(history[2].reason).toBe('crash')
    })

    it('should handle restart from stopped', () => {
      const lm = new LifecycleManager(logger)
      lm.transition('ready')
      lm.transition('start')
      lm.transition('stop')
      expect(lm.getState()).toBe('stopped')

      // 重启
      lm.transition('initialize')
      expect(lm.getState()).toBe('initializing')

      lm.transition('ready')
      lm.transition('start')
      expect(lm.getState()).toBe('running')
      expect(lm.isRunning()).toBe(true)

      const history = lm.getHistory()
      // ready, start, stop, initialize, ready, start = 6 transitions
      expect(history).toHaveLength(6)
    })
  })

  describe('logging', () => {
    it('should log transitions', () => {
      const infoSpy = vi.spyOn(logger, 'info')
      const lm = new LifecycleManager(logger)
      infoSpy.mockClear() // 清除构造函数的日志
      lm.transition('ready')
      expect(infoSpy).toHaveBeenCalled()
      const lastCall = infoSpy.mock.calls[infoSpy.mock.calls.length - 1]
      expect(lastCall[0]).toBe('Lifecycle transition')
    })

    it('should log errors on invalid transitions', () => {
      const errorSpy = vi.spyOn(logger, 'error')
      const lm = new LifecycleManager(logger)
      expect(() => lm.transition('start')).toThrow()
      expect(errorSpy).toHaveBeenCalled()
    })
  })
})

describe('isValidTransition (model function)', () => {
  it('should validate transitions according to VALID_TRANSITIONS map', () => {
    const testCases: Array<{
      from: LifecycleState
      to: LifecycleState
      expected: boolean
    }> = [
      { from: 'initializing', to: 'ready', expected: true },
      { from: 'initializing', to: 'failed', expected: true },
      { from: 'initializing', to: 'running', expected: false },
      { from: 'ready', to: 'running', expected: true },
      { from: 'ready', to: 'stopped', expected: true },
      { from: 'ready', to: 'paused', expected: false },
      { from: 'running', to: 'paused', expected: true },
      { from: 'running', to: 'draining', expected: true },
      { from: 'running', to: 'failed', expected: true },
      { from: 'running', to: 'stopped', expected: true },
      { from: 'running', to: 'ready', expected: false },
      { from: 'paused', to: 'running', expected: true },
      { from: 'paused', to: 'stopped', expected: true },
      { from: 'paused', to: 'draining', expected: false },
      { from: 'draining', to: 'stopped', expected: true },
      { from: 'draining', to: 'running', expected: false },
      { from: 'recovering', to: 'running', expected: true },
      { from: 'recovering', to: 'failed', expected: true },
      { from: 'recovering', to: 'paused', expected: false },
      { from: 'failed', to: 'recovering', expected: true },
      { from: 'failed', to: 'stopped', expected: true },
      { from: 'failed', to: 'running', expected: false },
      { from: 'stopped', to: 'initializing', expected: true },
      { from: 'stopped', to: 'running', expected: false },
    ]

    for (const tc of testCases) {
      expect(isValidTransition(tc.from, tc.to)).toBe(tc.expected)
    }
  })

  it('should have VALID_TRANSITIONS covering all 8 states', () => {
    const allStates: LifecycleState[] = [
      'initializing',
      'ready',
      'running',
      'paused',
      'draining',
      'recovering',
      'failed',
      'stopped',
    ]
    for (const state of allStates) {
      expect(VALID_TRANSITIONS[state]).toBeDefined()
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true)
    }
  })

  it('should have at least one valid transition from each state', () => {
    const allStates: LifecycleState[] = [
      'initializing',
      'ready',
      'running',
      'paused',
      'draining',
      'recovering',
      'failed',
      'stopped',
    ]
    for (const state of allStates) {
      expect(VALID_TRANSITIONS[state].length).toBeGreaterThan(0)
    }
  })
})
