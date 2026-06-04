import type { AppConfig } from '../data/model/app_config.js'

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  file?: string
  line?: number
  function?: string
  meta?: Record<string, unknown>
}

export abstract class Logger {
  protected config: AppConfig
  protected level: LogLevel
  protected file: string

  constructor(config: AppConfig, filename: string = 'unknown') {
    this.config = config
    this.file = filename
    this.level = this.parseLogLevel(config.logging.level)
    this.trace('Logger initialized', { level: config.logging.level, file: filename })
  }

  private parseLogLevel(level: string): LogLevel {
    this.trace('parseLogLevel called', { input: level })
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
        this.trace('parseLogLevel using default', { default: 'info' })
        return LogLevel.INFO
    }
  }

  protected shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const result = levels.indexOf(level) >= levels.indexOf(this.level)
    return result
  }

  abstract trace(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void
  abstract debug(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void
  abstract info(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void
  abstract warn(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void
  abstract error(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void
  protected abstract log(entry: LogEntry): void
}

export class ConsoleLogger extends Logger {
  constructor(config: AppConfig, filename: string = 'unknown') {
    super(config, filename)
  }

  trace(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.TRACE, message, file: this.file, line, function: func, meta })
    }
  }

  debug(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.DEBUG, message, file: this.file, line, function: func, meta })
    }
  }

  info(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.INFO, message, file: this.file, line, function: func, meta })
    }
  }

  warn(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.WARN, message, file: this.file, line, function: func, meta })
    }
  }

  error(message: string, meta?: Record<string, unknown>, line?: number, func?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.ERROR, message, file: this.file, line, function: func, meta })
    }
  }

  protected log(entry: LogEntry): void {
    let output: string
    if (this.config.logging.format === 'json') {
      output = JSON.stringify(entry)
    } else {
      let prefix = `${entry.timestamp} [${entry.level.toUpperCase()}]`
      if (entry.file) prefix += ` [${entry.file}]`
      if (entry.function) prefix += ` [${entry.function}]`
      if (entry.line) prefix += `:${entry.line}`
      output = `${prefix} ${entry.message}`
    }
    if (entry.level === LogLevel.ERROR) {
      console.error(output)
    } else {
      console.log(output)
    }
  }
}
