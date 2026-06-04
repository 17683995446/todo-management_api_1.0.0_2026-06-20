import type { AppConfig } from '../data/model/app_config.js'

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}

export abstract class Logger {
  protected config: AppConfig
  protected level: LogLevel

  constructor(config: AppConfig) {
    this.config = config
    this.level = this.parseLogLevel(config.logging.level)
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
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
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }

  abstract debug(message: string, meta?: Record<string, unknown>): void
  abstract info(message: string, meta?: Record<string, unknown>): void
  abstract warn(message: string, meta?: Record<string, unknown>): void
  abstract error(message: string, meta?: Record<string, unknown>): void
  protected abstract log(entry: LogEntry): void
}

export class ConsoleLogger extends Logger {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.DEBUG, message, meta })
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.INFO, message, meta })
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.WARN, message, meta })
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log({ timestamp: new Date().toISOString(), level: LogLevel.ERROR, message, meta })
    }
  }

  protected log(entry: LogEntry): void {
    const output =
      this.config.logging.format === 'json' ? JSON.stringify(entry) : `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}`
    if (entry.level === LogLevel.ERROR) {
      console.error(output)
    } else {
      console.log(output)
    }
  }
}
