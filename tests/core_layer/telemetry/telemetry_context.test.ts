import { describe, it, expect } from 'vitest'
import {
  generateTraceId,
  generateSpanId,
  generateTraceContext,
  getCurrentTraceContext,
  runWithTraceContext,
  TelemetryManager
} from '../../../src/core_layer/telemetry/telemetry_context.js'

describe('TelemetryContext', () => {
  it('should generate valid traceId', () => {
    const traceId = generateTraceId()
    expect(traceId).toHaveLength(32)
    expect(/^[0-9a-f]+$/i.test(traceId)).toBe(true)
  })

  it('should generate valid spanId', () => {
    const spanId = generateSpanId()
    expect(spanId).toHaveLength(16)
    expect(/^[0-9a-f]+$/i.test(spanId)).toBe(true)
  })

  it('should generate unique trace contexts', () => {
    const ctx1 = generateTraceContext()
    const ctx2 = generateTraceContext()
    expect(ctx1.traceId).not.toBe(ctx2.traceId)
    expect(ctx1.spanId).not.toBe(ctx2.spanId)
  })

  it('should return undefined outside of trace context', () => {
    expect(getCurrentTraceContext()).toBeUndefined()
  })

  it('should propagate trace context through runWithTraceContext', () => {
    const ctx = generateTraceContext()
    const result = runWithTraceContext(ctx, () => {
      return getCurrentTraceContext()
    })
    expect(result).toEqual(ctx)
  })

  it('should isolate nested trace contexts', () => {
    const outer = generateTraceContext()
    const inner = generateTraceContext()

    runWithTraceContext(outer, () => {
      expect(getCurrentTraceContext()).toEqual(outer)
      runWithTraceContext(inner, () => {
        expect(getCurrentTraceContext()).toEqual(inner)
      })
      expect(getCurrentTraceContext()).toEqual(outer)
    })
  })
})

describe('TelemetryManager', () => {
  it('should initialize and provide a tracer', () => {
    const telemetry = new TelemetryManager('test-service', '1.0.0')
    const tracer = telemetry.getTracer()
    expect(tracer).toBeDefined()
  })

  it('should start and end a span', () => {
    const telemetry = new TelemetryManager('test-service', '1.0.0')
    const span = telemetry.startSpan('test-span')
    expect(span).toBeDefined()
    expect(span.spanContext().traceId).toHaveLength(32)
    expect(span.spanContext().spanId).toHaveLength(16)
    span.end()
  })

  it('should shutdown without error', async () => {
    const telemetry = new TelemetryManager('test-service', '1.0.0')
    await telemetry.shutdown()
  })
})
