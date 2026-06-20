import type { AppConfig } from '../data/model/app_config.js'
import { getCurrentTraceContext } from '../telemetry/telemetry_context.js'

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  file?: string
  line?: number
  function?: string
  traceId?: string
  spanId?: string
  meta?: Record<string, unknown>
}

export abstract class Logger {
  protected config: AppConfig
  protected level: LogLevel
  protected file: string

  constructor(config: AppConfig, filename = 'unknown') {
    this.config = config
    this.file = filename
    // LOG_LEVEL 环境变量覆盖配置文件中的日志级别，便于临时排查问题
    const envLevel = process.env.LOG_LEVEL
    const configLevel = envLevel || config.logging.level
    // 先赋值 level，再调用 trace，避免 parseLogLevel 中的 trace 在 level 未定义时误输出
    this.level = this.parseLogLevel(configLevel)
    this.trace('Logger initialized', {
      level: configLevel,
      file: filename,
      envOverride: !!envLevel,
    })
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'trace':
        return LogLevel.TRACE
      case 'debug':
        return LogLevel.DEBUG
      case 'info':
        return LogLevel.INFO
      case 'warn':
        return LogLevel.WARN
      case 'error':
        return LogLevel.ERROR
      default:
        return LogLevel.INFO
    }
  }

  protected shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.TRACE,
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ]
    const result = levels.indexOf(level) >= levels.indexOf(this.level)
    return result
  }

  abstract trace(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void
  abstract debug(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void
  abstract info(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void
  abstract warn(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void
  abstract error(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void
  protected abstract log(entry: LogEntry): void
}

export class ConsoleLogger extends Logger {
  constructor(config: AppConfig, filename = 'unknown') {
    super(config, filename)
  }

  trace(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.log({
        timestamp: new Date().toISOString(),
        level: LogLevel.TRACE,
        message,
        file: this.file,
        line,
        function: func,
        meta,
      })
    }
  }

  debug(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log({
        timestamp: new Date().toISOString(),
        level: LogLevel.DEBUG,
        message,
        file: this.file,
        line,
        function: func,
        meta,
      })
    }
  }

  info(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log({
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message,
        file: this.file,
        line,
        function: func,
        meta,
      })
    }
  }

  warn(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log({
        timestamp: new Date().toISOString(),
        level: LogLevel.WARN,
        message,
        file: this.file,
        line,
        function: func,
        meta,
      })
    }
  }

  error(
    message: string,
    meta?: Record<string, unknown>,
    line?: number,
    func?: string,
  ): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log({
        timestamp: new Date().toISOString(),
        level: LogLevel.ERROR,
        message,
        file: this.file,
        line,
        function: func,
        meta,
      })
    }
  }

  protected log(entry: LogEntry): void {
    const traceContext = getCurrentTraceContext()
    const enrichedEntry: LogEntry = traceContext
      ? { ...entry, traceId: traceContext.traceId, spanId: traceContext.spanId }
      : entry

    let output: string
    if (this.config.logging.format === 'json') {
      output = JSON.stringify(enrichedEntry)
    } else {
      let prefix = `${enrichedEntry.timestamp} [${enrichedEntry.level.toUpperCase()}]`
      if (enrichedEntry.traceId) prefix += ` [trace=${enrichedEntry.traceId}]`
      if (enrichedEntry.file) prefix += ` [${enrichedEntry.file}]`
      if (enrichedEntry.function) prefix += ` [${enrichedEntry.function}]`
      if (enrichedEntry.line) prefix += `:${enrichedEntry.line}`
      output = `${prefix} ${enrichedEntry.message}`
    }
    if (enrichedEntry.level === LogLevel.ERROR) {
      console.error(output)
    } else {
      console.log(output)
    }
  }
}
