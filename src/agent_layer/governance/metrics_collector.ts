import type { Logger } from '../../core_layer/logic/logger.js'
import type { IMetricsCollector } from '../agent.interface.js'
import type {
  HistogramStats,
  MetricDefinition,
  MetricSnapshot,
  MetricType,
} from '../model/metrics.js'
import { METRIC_DEFINITIONS } from '../model/metrics.js'

/**
 * 指标采集器
 *
 * 结构化采集 Agent 运行指标，支持可观测性。
 *
 * 设计原则：
 * - 四种指标类型：counter（只增）、gauge（可增减）、histogram（分布）、timer（耗时）
 * - 指标按名称聚合（labels 参数接受但当前按名称汇总，保留扩展性）
 * - 直方图/计时器计算 p50/p95/p99 分位数
 * - 预定义指标自动注册，自定义指标按使用自动注册
 * - 采集操作非阻塞，不影响主流程
 * - 支持快照导出用于外部监控系统
 *
 * 这是秩序化的可观测性：Agent 行为可度量、可分析。
 */
export class MetricsCollector implements IMetricsCollector {
  private readonly counters = new Map<string, number>()
  private readonly gauges = new Map<string, number>()
  private readonly histograms = new Map<string, number[]>()
  private readonly timers = new Map<string, number[]>()
  private readonly definitionsMap = new Map<string, MetricDefinition>()

  constructor(private readonly logger: Logger) {
    // 注册预定义指标
    for (const def of METRIC_DEFINITIONS) {
      this.definitionsMap.set(def.name, def)
    }
    this.logger.info('Metrics collector initialized', {
      predefinedCount: METRIC_DEFINITIONS.length,
    })
  }

  incrementCounter(
    name: string,
    value = 1,
    _labels?: Record<string, string>,
  ): void {
    const current = this.counters.get(name) ?? 0
    this.counters.set(name, current + value)
    this.ensureDefinition(name, 'counter')
  }

  setGauge(
    name: string,
    value: number,
    _labels?: Record<string, string>,
  ): void {
    this.gauges.set(name, value)
    this.ensureDefinition(name, 'gauge')
  }

  recordHistogram(
    name: string,
    value: number,
    _labels?: Record<string, string>,
  ): void {
    let samples = this.histograms.get(name)
    if (!samples) {
      samples = []
      this.histograms.set(name, samples)
    }
    samples.push(value)
    this.ensureDefinition(name, 'histogram')
  }

  recordTimer(
    name: string,
    durationMs: number,
    _labels?: Record<string, string>,
  ): void {
    let samples = this.timers.get(name)
    if (!samples) {
      samples = []
      this.timers.set(name, samples)
    }
    samples.push(durationMs)
    this.ensureDefinition(name, 'timer')
  }

  getCounter(name: string): number {
    return this.counters.get(name) ?? 0
  }

  getGauge(name: string): number {
    return this.gauges.get(name) ?? 0
  }

  getHistogram(name: string): HistogramStats | null {
    const samples = this.histograms.get(name)
    if (!samples || samples.length === 0) {
      return null
    }
    return this.computeStats(samples)
  }

  getTimer(name: string): HistogramStats | null {
    const samples = this.timers.get(name)
    if (!samples || samples.length === 0) {
      return null
    }
    return this.computeStats(samples)
  }

  snapshot(): MetricSnapshot {
    const counters: Record<string, number> = {}
    for (const [name, value] of this.counters) {
      counters[name] = value
    }

    const gauges: Record<string, number> = {}
    for (const [name, value] of this.gauges) {
      gauges[name] = value
    }

    const histograms: Record<string, HistogramStats> = {}
    for (const [name, samples] of this.histograms) {
      if (samples.length > 0) {
        histograms[name] = this.computeStats(samples)
      }
    }

    const timers: Record<string, HistogramStats> = {}
    for (const [name, samples] of this.timers) {
      if (samples.length > 0) {
        timers[name] = this.computeStats(samples)
      }
    }

    return {
      collectedAt: new Date().toISOString(),
      counters,
      gauges,
      histograms,
      timers,
    }
  }

  definitions(): MetricDefinition[] {
    return Array.from(this.definitionsMap.values())
  }

  reset(): void {
    this.counters.clear()
    this.gauges.clear()
    this.histograms.clear()
    this.timers.clear()
    this.logger.info('Metrics collector reset')
  }

  /**
   * 确保指标定义存在（自动注册）
   */
  private ensureDefinition(name: string, type: MetricType): void {
    if (!this.definitionsMap.has(name)) {
      this.definitionsMap.set(name, {
        name,
        type,
        description: `Auto-registered ${type} metric`,
      })
    }
  }

  /**
   * 计算直方图统计（分位数使用线性插值法）
   */
  private computeStats(samples: number[]): HistogramStats {
    const sorted = [...samples].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((acc, v) => acc + v, 0)
    const min = sorted[0]
    const max = sorted[count - 1]
    const mean = sum / count

    return {
      count,
      sum,
      min,
      max,
      mean,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    }
  }

  /**
   * 计算分位数（线性插值法）
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    if (sorted.length === 1) return sorted[0]

    const index = p * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)

    if (lower === upper) {
      return sorted[lower]
    }

    const weight = index - lower
    return sorted[lower] * (1 - weight) + sorted[upper] * weight
  }
}
