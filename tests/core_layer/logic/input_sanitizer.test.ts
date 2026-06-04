import { describe, it, expect } from 'vitest'
import { BasicInputSanitizer } from '../../../src/core_layer/logic/input_sanitizer.js'

describe('BasicInputSanitizer', () => {
  const sanitizer = new BasicInputSanitizer()

  it('should sanitize strings', () => {
    expect(sanitizer.sanitizeString('  <script>  ')).toEqual('script')
  })

  it('should sanitize numbers', () => {
    expect(sanitizer.sanitizeNumber(NaN)).toEqual(0)
    expect(sanitizer.sanitizeNumber(42)).toEqual(42)
  })

  it('should sanitize booleans', () => {
    expect(sanitizer.sanitizeBoolean(undefined as unknown as boolean)).toEqual(false)
    expect(sanitizer.sanitizeBoolean(true)).toEqual(true)
  })
})
