import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { trace, type Tracer, type Span } from '@opentelemetry/api'
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'

/**
 * OpenTelemetry 兼容的追踪上下文
 */
export interface TraceContext {
  /** Trace ID */
  readonly traceId: string
  /** Span ID */
  readonly spanId: string
}

const traceStorage = new AsyncLocalStorage<TraceContext>()

/**
 * 生成符合 OpenTelemetry 规范的 32 位十六进制 traceId
 */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 生成符合 OpenTelemetry 规范的 16 位十六进制 spanId
 */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex')
}

/**
 * 生成新的追踪上下文
 */
export function generateTraceContext(): TraceContext {
  return {
    traceId: generateTraceId(),
    spanId: generateSpanId()
  }
}

/**
 * 获取当前异步上下文中的追踪上下文
 */
export function getCurrentTraceContext(): TraceContext | undefined {
  return traceStorage.getStore()
}

/**
 * 在指定的追踪上下文中运行函数
 */
export function runWithTraceContext<T>(ctx: TraceContext, fn: () => T): T {
  return traceStorage.run(ctx, fn)
}

/**
 * 全局 Telemetry 管理器
 * 负责初始化 OpenTelemetry TracerProvider 并提供 Tracer
 */
export class TelemetryManager {
  private readonly provider: BasicTracerProvider
  private readonly tracer: Tracer

  constructor(serviceName: string, serviceVersion: string) {
    this.provider = new BasicTracerProvider({
      resource: {
        attributes: {
          'service.name': serviceName,
          'service.version': serviceVersion
        }
      } as never
    })
    trace.setGlobalTracerProvider(this.provider)
    this.tracer = trace.getTracer(serviceName, serviceVersion)
  }

  /**
   * 获取 tracer 实例
   */
  getTracer(): Tracer {
    return this.tracer
  }

  /**
   * 创建一个请求 span
   */
  startSpan(name: string): Span {
    return this.tracer.startSpan(name)
  }

  /**
   * 关闭 provider，释放资源
   */
  async shutdown(): Promise<void> {
    await this.provider.shutdown()
  }
}
