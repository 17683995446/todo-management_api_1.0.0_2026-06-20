import type { Logger } from "./logger.js"

export abstract class InputSanitizer {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace("InputSanitizer initialized", {}, 10, "constructor")
  }

  abstract sanitizeString(input: unknown): string
  abstract sanitizeNumber(input: unknown): number
  abstract sanitizeBoolean(input: unknown): boolean
}

export class BasicInputSanitizer extends InputSanitizer {
  sanitizeString(input: unknown): string {
    this.logger.trace("BasicInputSanitizer.sanitizeString called", { input }, 20, "sanitizeString")
    let strInput: string
    if (typeof input === 'string') {
      strInput = input
    } else if (input === null || input === undefined) {
      strInput = ''
    } else {
      try {
        strInput = String(input)
      } catch {
        strInput = ''
      }
    }
    const sanitized = strInput.trim().replace(/[<>]/g, '')
    this.logger.trace("BasicInputSanitizer.sanitizeString returning", { sanitized }, 32, "sanitizeString")
    return sanitized
  }

  sanitizeNumber(input: unknown): number {
    this.logger.trace("BasicInputSanitizer.sanitizeNumber called", { input }, 36, "sanitizeNumber")
    let numInput: number
    try {
      numInput = Number(input)
    } catch {
      numInput = 0
    }
    const sanitized = Number.isFinite(numInput) ? numInput : 0
    this.logger.trace("BasicInputSanitizer.sanitizeNumber returning", { sanitized }, 43, "sanitizeNumber")
    return sanitized
  }

  sanitizeBoolean(input: unknown): boolean {
    this.logger.trace("BasicInputSanitizer.sanitizeBoolean called", { input }, 46, "sanitizeBoolean")
    let boolInput: boolean
    try {
      boolInput = Boolean(input)
    } catch {
      boolInput = false
    }
    this.logger.trace("BasicInputSanitizer.sanitizeBoolean returning", { sanitized: boolInput }, 53, "sanitizeBoolean")
    return boolInput
  }
}
