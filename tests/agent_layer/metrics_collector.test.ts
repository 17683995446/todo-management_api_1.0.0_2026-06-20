import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MetricsCollector } from '../../src/agent_layer/governance/metrics_collector.js'
import {
  METRIC_DEFINITIONS,
  METRIC_NAMES,
} from '../../src/agent_layer/model/metrics.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'

describe('MetricsCollector', () => {
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
    logger = new ConsoleLogger(config, 'metrics-test')
  })

  describe('initialization', () => {
    it('should initialize with predefined metric definitions', () => {
      const mc = new MetricsCollector(logger)
      const defs = mc.definitions()
      expect(defs.length).toBeGreaterThanOrEqual(METRIC_DEFINITIONS.length)
    })

    it('should have all 15 predefined metrics', () => {
      const mc = new MetricsCollector(logger)
      const defs = mc.definitions()
      const predefinedNames = METRIC_DEFINITIONS.map((d) => d.name)
      for (const name of predefinedNames) {
        expect(defs.find((d) => d.name === name)).toBeDefined()
      }
    })

    it('should start with zero counters', () => {
      const mc = new MetricsCollector(logger)
      expect(mc.getCounter(METRIC_NAMES.CYCLES_TOTAL)).toBe(0)
      expect(mc.getCounter('nonexistent')).toBe(0)
    })

    it('should start with zero gauges', () => {
      const mc = new MetricsCollector(logger)
      expect(mc.getGauge(METRIC_NAMES.MEMORY_USAGE_MB)).toBe(0)
      expect(mc.getGauge('nonexistent')).toBe(0)
    })

    it('should return null for nonexistent histograms', () => {
      const mc = new MetricsCollector(logger)
      expect(mc.getHistogram('nonexistent')).toBeNull()
    })

    it('should return null for nonexistent timers', () => {
      const mc = new MetricsCollector(logger)
      expect(mc.getTimer('nonexistent')).toBeNull()
    })
  })

  describe('counter', () => {
    it('should increment counter by 1 by default', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('test.counter')
      expect(mc.getCounter('test.counter')).toBe(1)
    })

    it('should increment counter by specified value', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('test.counter', 5)
      expect(mc.getCounter('test.counter')).toBe(5)
    })

    it('should accumulate counter increments', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('test.counter', 1)
      mc.incrementCounter('test.counter', 2)
      mc.incrementCounter('test.counter', 3)
      expect(mc.getCounter('test.counter')).toBe(6)
    })

    it('should handle multiple independent counters', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('counter.a', 10)
      mc.incrementCounter('counter.b', 20)
      expect(mc.getCounter('counter.a')).toBe(10)
      expect(mc.getCounter('counter.b')).toBe(20)
    })

    it('should accept labels without affecting aggregation', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('test.counter', 1, { source: 'a' })
      mc.incrementCounter('test.counter', 1, { source: 'b' })
      mc.incrementCounter('test.counter', 1, { source: 'a' })
      // labels accepted, aggregated by name
      expect(mc.getCounter('test.counter')).toBe(3)
    })

    it('should auto-register definition on first use', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('custom.counter', 1)
      const defs = mc.definitions()
      const customDef = defs.find((d) => d.name === 'custom.counter')
      expect(customDef).toBeDefined()
      expect(customDef?.type).toBe('counter')
    })
  })

  describe('gauge', () => {
    it('should set gauge value', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('test.gauge', 42)
      expect(mc.getGauge('test.gauge')).toBe(42)
    })

    it('should overwrite gauge value (last wins)', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('test.gauge', 10)
      mc.setGauge('test.gauge', 20)
      mc.setGauge('test.gauge', 5)
      expect(mc.getGauge('test.gauge')).toBe(5)
    })

    it('should handle negative values', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('test.gauge', -100)
      expect(mc.getGauge('test.gauge')).toBe(-100)
    })

    it('should handle zero value', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('test.gauge', 100)
      mc.setGauge('test.gauge', 0)
      expect(mc.getGauge('test.gauge')).toBe(0)
    })

    it('should handle multiple independent gauges', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('gauge.a', 1)
      mc.setGauge('gauge.b', 2)
      mc.setGauge('gauge.c', 3)
      expect(mc.getGauge('gauge.a')).toBe(1)
      expect(mc.getGauge('gauge.b')).toBe(2)
      expect(mc.getGauge('gauge.c')).toBe(3)
    })

    it('should auto-register definition on first use', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('custom.gauge', 1)
      const defs = mc.definitions()
      const customDef = defs.find((d) => d.name === 'custom.gauge')
      expect(customDef).toBeDefined()
      expect(customDef?.type).toBe('gauge')
    })
  })

  describe('histogram', () => {
    it('should record single sample', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('test.hist', 100)
      const stats = mc.getHistogram('test.hist')
      expect(stats).not.toBeNull()
      expect(stats?.count).toBe(1)
      expect(stats?.sum).toBe(100)
      expect(stats?.min).toBe(100)
      expect(stats?.max).toBe(100)
      expect(stats?.mean).toBe(100)
    })

    it('should compute correct stats for multiple samples', () => {
      const mc = new MetricsCollector(logger)
      const samples = [10, 20, 30, 40, 50]
      for (const s of samples) {
        mc.recordHistogram('test.hist', s)
      }
      const stats = mc.getHistogram('test.hist')
      expect(stats?.count).toBe(5)
      expect(stats?.sum).toBe(150)
      expect(stats?.min).toBe(10)
      expect(stats?.max).toBe(50)
      expect(stats?.mean).toBe(30)
    })

    it('should compute p50 correctly', () => {
      const mc = new MetricsCollector(logger)
      const samples = [10, 20, 30, 40, 50]
      for (const s of samples) {
        mc.recordHistogram('test.hist', s)
      }
      const stats = mc.getHistogram('test.hist')
      // p50 with 5 samples, index = 0.5 * 4 = 2, so sorted[2] = 30
      expect(stats?.p50).toBe(30)
    })

    it('should compute p95 correctly', () => {
      const mc = new MetricsCollector(logger)
      const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      for (const s of samples) {
        mc.recordHistogram('test.hist', s)
      }
      const stats = mc.getHistogram('test.hist')
      // p95 with 10 samples, index = 0.95 * 9 = 8.55, interpolate between 90 and 100
      // 90 * 0.45 + 100 * 0.55 = 40.5 + 55 = 95.5
      expect(stats?.p95).toBeCloseTo(95.5, 1)
    })

    it('should compute p99 correctly', () => {
      const mc = new MetricsCollector(logger)
      const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      for (const s of samples) {
        mc.recordHistogram('test.hist', s)
      }
      const stats = mc.getHistogram('test.hist')
      // p99 with 10 samples, index = 0.99 * 9 = 8.91, interpolate between 90 and 100
      // 90 * 0.09 + 100 * 0.91 = 8.1 + 91 = 99.1
      expect(stats?.p99).toBeCloseTo(99.1, 1)
    })

    it('should handle single sample for percentiles', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('test.hist', 42)
      const stats = mc.getHistogram('test.hist')
      expect(stats?.p50).toBe(42)
      expect(stats?.p95).toBe(42)
      expect(stats?.p99).toBe(42)
    })

    it('should handle duplicate values', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('test.hist', 50)
      mc.recordHistogram('test.hist', 50)
      mc.recordHistogram('test.hist', 50)
      const stats = mc.getHistogram('test.hist')
      expect(stats?.count).toBe(3)
      expect(stats?.sum).toBe(150)
      expect(stats?.min).toBe(50)
      expect(stats?.max).toBe(50)
      expect(stats?.mean).toBe(50)
      expect(stats?.p50).toBe(50)
      expect(stats?.p95).toBe(50)
      expect(stats?.p99).toBe(50)
    })

    it('should auto-register definition on first use', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('custom.hist', 1)
      const defs = mc.definitions()
      const customDef = defs.find((d) => d.name === 'custom.hist')
      expect(customDef).toBeDefined()
      expect(customDef?.type).toBe('histogram')
    })
  })

  describe('timer', () => {
    it('should record single timer sample', () => {
      const mc = new MetricsCollector(logger)
      mc.recordTimer('test.timer', 500)
      const stats = mc.getTimer('test.timer')
      expect(stats).not.toBeNull()
      expect(stats?.count).toBe(1)
      expect(stats?.sum).toBe(500)
      expect(stats?.mean).toBe(500)
    })

    it('should compute timer stats like histogram', () => {
      const mc = new MetricsCollector(logger)
      const durations = [100, 200, 300, 400, 500]
      for (const d of durations) {
        mc.recordTimer('test.timer', d)
      }
      const stats = mc.getTimer('test.timer')
      expect(stats?.count).toBe(5)
      expect(stats?.sum).toBe(1500)
      expect(stats?.min).toBe(100)
      expect(stats?.max).toBe(500)
      expect(stats?.mean).toBe(300)
      expect(stats?.p50).toBe(300)
    })

    it('should keep timers and histograms separate', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('test.metric', 10)
      mc.recordTimer('test.metric', 20)
      // Same name but different storage
      const hist = mc.getHistogram('test.metric')
      const timer = mc.getTimer('test.metric')
      expect(hist?.count).toBe(1)
      expect(hist?.sum).toBe(10)
      expect(timer?.count).toBe(1)
      expect(timer?.sum).toBe(20)
    })

    it('should auto-register definition on first use', () => {
      const mc = new MetricsCollector(logger)
      mc.recordTimer('custom.timer', 1)
      const defs = mc.definitions()
      const customDef = defs.find((d) => d.name === 'custom.timer')
      expect(customDef).toBeDefined()
      expect(customDef?.type).toBe('timer')
    })
  })

  describe('snapshot', () => {
    it('should return empty snapshot when no metrics recorded', () => {
      const mc = new MetricsCollector(logger)
      const snap = mc.snapshot()
      expect(snap.collectedAt).toBeTruthy()
      expect(Object.keys(snap.counters)).toHaveLength(0)
      expect(Object.keys(snap.gauges)).toHaveLength(0)
      expect(Object.keys(snap.histograms)).toHaveLength(0)
      expect(Object.keys(snap.timers)).toHaveLength(0)
    })

    it('should include collectedAt as ISO string', () => {
      const mc = new MetricsCollector(logger)
      const before = new Date().toISOString()
      const snap = mc.snapshot()
      const after = new Date().toISOString()
      expect(snap.collectedAt >= before).toBe(true)
      expect(snap.collectedAt <= after).toBe(true)
      const parsed = new Date(snap.collectedAt)
      expect(parsed.getTime()).not.toBeNaN()
    })

    it('should include all counters in snapshot', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('c1', 10)
      mc.incrementCounter('c2', 20)
      const snap = mc.snapshot()
      expect(snap.counters.c1).toBe(10)
      expect(snap.counters.c2).toBe(20)
    })

    it('should include all gauges in snapshot', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('g1', 100)
      mc.setGauge('g2', 200)
      const snap = mc.snapshot()
      expect(snap.gauges.g1).toBe(100)
      expect(snap.gauges.g2).toBe(200)
    })

    it('should include all histograms in snapshot', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('h1', 10)
      mc.recordHistogram('h1', 20)
      mc.recordHistogram('h2', 30)
      const snap = mc.snapshot()
      expect(snap.histograms.h1).toBeDefined()
      expect(snap.histograms.h1.count).toBe(2)
      expect(snap.histograms.h2).toBeDefined()
      expect(snap.histograms.h2.count).toBe(1)
    })

    it('should include all timers in snapshot', () => {
      const mc = new MetricsCollector(logger)
      mc.recordTimer('t1', 100)
      mc.recordTimer('t1', 200)
      const snap = mc.snapshot()
      expect(snap.timers.t1).toBeDefined()
      expect(snap.timers.t1.count).toBe(2)
      expect(snap.timers.t1.sum).toBe(300)
    })

    it('should return independent snapshots (not shared reference)', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('c1', 10)
      const snap1 = mc.snapshot()
      mc.incrementCounter('c1', 5)
      const snap2 = mc.snapshot()
      expect(snap1.counters.c1).toBe(10)
      expect(snap2.counters.c1).toBe(15)
    })
  })

  describe('definitions', () => {
    it('should return all predefined definitions', () => {
      const mc = new MetricsCollector(logger)
      const defs = mc.definitions()
      const predefinedCount = METRIC_DEFINITIONS.length
      expect(defs.length).toBeGreaterThanOrEqual(predefinedCount)
    })

    it('should include auto-registered definitions', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('auto.counter', 1)
      mc.setGauge('auto.gauge', 1)
      mc.recordHistogram('auto.hist', 1)
      mc.recordTimer('auto.timer', 1)
      const defs = mc.definitions()
      expect(defs.find((d) => d.name === 'auto.counter')?.type).toBe('counter')
      expect(defs.find((d) => d.name === 'auto.gauge')?.type).toBe('gauge')
      expect(defs.find((d) => d.name === 'auto.hist')?.type).toBe('histogram')
      expect(defs.find((d) => d.name === 'auto.timer')?.type).toBe('timer')
    })

    it('should not duplicate definitions on repeated use', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('dup.counter', 1)
      mc.incrementCounter('dup.counter', 1)
      mc.incrementCounter('dup.counter', 1)
      const defs = mc.definitions().filter((d) => d.name === 'dup.counter')
      expect(defs).toHaveLength(1)
    })
  })

  describe('reset', () => {
    it('should clear all counters', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('c1', 10)
      mc.incrementCounter('c2', 20)
      mc.reset()
      expect(mc.getCounter('c1')).toBe(0)
      expect(mc.getCounter('c2')).toBe(0)
    })

    it('should clear all gauges', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge('g1', 100)
      mc.reset()
      expect(mc.getGauge('g1')).toBe(0)
    })

    it('should clear all histograms', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('h1', 10)
      mc.reset()
      expect(mc.getHistogram('h1')).toBeNull()
    })

    it('should clear all timers', () => {
      const mc = new MetricsCollector(logger)
      mc.recordTimer('t1', 100)
      mc.reset()
      expect(mc.getTimer('t1')).toBeNull()
    })

    it('should produce empty snapshot after reset', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('c1', 10)
      mc.setGauge('g1', 100)
      mc.recordHistogram('h1', 10)
      mc.recordTimer('t1', 100)
      mc.reset()
      const snap = mc.snapshot()
      expect(Object.keys(snap.counters)).toHaveLength(0)
      expect(Object.keys(snap.gauges)).toHaveLength(0)
      expect(Object.keys(snap.histograms)).toHaveLength(0)
      expect(Object.keys(snap.timers)).toHaveLength(0)
    })

    it('should preserve definitions after reset', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('custom.counter', 1)
      const defsBefore = mc.definitions()
      mc.reset()
      const defsAfter = mc.definitions()
      expect(defsAfter.length).toBe(defsBefore.length)
      expect(defsAfter.find((d) => d.name === 'custom.counter')).toBeDefined()
    })
  })

  describe('predefined metrics integration', () => {
    it('should track cycles total', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter(METRIC_NAMES.CYCLES_TOTAL)
      mc.incrementCounter(METRIC_NAMES.CYCLES_TOTAL)
      mc.incrementCounter(METRIC_NAMES.CYCLES_TOTAL)
      expect(mc.getCounter(METRIC_NAMES.CYCLES_TOTAL)).toBe(3)
    })

    it('should track actions success and failure', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter(METRIC_NAMES.ACTIONS_SUCCESS, 5)
      mc.incrementCounter(METRIC_NAMES.ACTIONS_FAILURE, 2)
      const total =
        mc.getCounter(METRIC_NAMES.ACTIONS_SUCCESS) +
        mc.getCounter(METRIC_NAMES.ACTIONS_FAILURE)
      expect(total).toBe(7)
    })

    it('should track memory usage as gauge', () => {
      const mc = new MetricsCollector(logger)
      mc.setGauge(METRIC_NAMES.MEMORY_USAGE_MB, 128.5)
      expect(mc.getGauge(METRIC_NAMES.MEMORY_USAGE_MB)).toBe(128.5)
    })

    it('should track cycle duration as histogram', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram(METRIC_NAMES.CYCLES_DURATION_MS, 100)
      mc.recordHistogram(METRIC_NAMES.CYCLES_DURATION_MS, 200)
      mc.recordHistogram(METRIC_NAMES.CYCLES_DURATION_MS, 300)
      const stats = mc.getHistogram(METRIC_NAMES.CYCLES_DURATION_MS)
      expect(stats?.count).toBe(3)
      expect(stats?.mean).toBe(200)
    })

    it('should track policy violations', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter(METRIC_NAMES.POLICY_VIOLATIONS, 3)
      expect(mc.getCounter(METRIC_NAMES.POLICY_VIOLATIONS)).toBe(3)
    })
  })

  describe('edge cases', () => {
    it('should handle large counter values', () => {
      const mc = new MetricsCollector(logger)
      mc.incrementCounter('large.counter', Number.MAX_SAFE_INTEGER - 1)
      mc.incrementCounter('large.counter', 1)
      expect(mc.getCounter('large.counter')).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle floating point values', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('float.hist', 1.5)
      mc.recordHistogram('float.hist', 2.5)
      mc.recordHistogram('float.hist', 3.5)
      const stats = mc.getHistogram('float.hist')
      expect(stats?.sum).toBeCloseTo(7.5, 5)
      expect(stats?.mean).toBeCloseTo(2.5, 5)
    })

    it('should handle many samples efficiently', () => {
      const mc = new MetricsCollector(logger)
      const sampleCount = 1000
      for (let i = 0; i < sampleCount; i++) {
        mc.recordHistogram('many.hist', i)
      }
      const stats = mc.getHistogram('many.hist')
      expect(stats?.count).toBe(sampleCount)
      expect(stats?.min).toBe(0)
      expect(stats?.max).toBe(sampleCount - 1)
      // mean of 0..999 = 499.5
      expect(stats?.mean).toBeCloseTo(499.5, 1)
    })

    it('should handle zero value in histogram', () => {
      const mc = new MetricsCollector(logger)
      mc.recordHistogram('zero.hist', 0)
      const stats = mc.getHistogram('zero.hist')
      expect(stats?.count).toBe(1)
      expect(stats?.min).toBe(0)
      expect(stats?.max).toBe(0)
      expect(stats?.mean).toBe(0)
    })
  })

  describe('logging', () => {
    it('should log initialization', () => {
      const infoSpy = vi.spyOn(logger, 'info')
      const mc = new MetricsCollector(logger)
      expect(infoSpy).toHaveBeenCalled()
      const initCall = infoSpy.mock.calls.find(
        (c) => c[0] === 'Metrics collector initialized',
      )
      expect(initCall).toBeDefined()
    })

    it('should log reset', () => {
      const infoSpy = vi.spyOn(logger, 'info')
      const mc = new MetricsCollector(logger)
      infoSpy.mockClear()
      mc.reset()
      expect(infoSpy).toHaveBeenCalledWith('Metrics collector reset')
    })
  })
})
