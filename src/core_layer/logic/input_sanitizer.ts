export abstract class InputSanitizer {
  abstract sanitizeString(input: string): string
  abstract sanitizeNumber(input: number): number
  abstract sanitizeBoolean(input: boolean): boolean
}

export class BasicInputSanitizer extends InputSanitizer {
  sanitizeString(input: string): string {
    return input.trim().replace(/[<>]/g, '')
  }

  sanitizeNumber(input: number): number {
    return Number.isFinite(input) ? input : 0
  }

  sanitizeBoolean(input: boolean): boolean {
    return Boolean(input)
  }
}
