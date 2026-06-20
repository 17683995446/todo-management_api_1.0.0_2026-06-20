import { describe, it, expect } from 'vitest'
import { validatePassword } from '../../../src/core_layer/logic/password_policy.js'

describe('PasswordPolicy', () => {
  describe('valid passwords', () => {
    it('should accept a strong password with score 4', () => {
      const result = validatePassword('MyStr0ng!Pass2024')
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.score).toBe(4)
    })

    it('should accept a password with mixed case and numbers (score 3)', () => {
      const result = validatePassword('TestPass99')
      expect(result.valid).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(3)
    })

    it('should accept a minimum valid password (score >= 1)', () => {
      const result = validatePassword('foo12bar')
      expect(result.valid).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(1)
    })
  })

  describe('length validation', () => {
    it('should reject password shorter than 8 characters', () => {
      const result = validatePassword('Ab1!')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at least 8 characters'))).toBe(true)
    })

    it('should reject empty password', () => {
      const result = validatePassword('')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject password longer than 128 characters', () => {
      const long = 'a1'.repeat(65) // 130 chars
      const result = validatePassword(long)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at most 128 characters'))).toBe(true)
    })
  })

  describe('character composition', () => {
    it('should reject password without letters', () => {
      const result = validatePassword('12345678')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at least one letter'))).toBe(true)
    })

    it('should reject password without numbers', () => {
      const result = validatePassword('abcdefgh')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at least one number'))).toBe(true)
    })
  })

  describe('common weak passwords blacklist', () => {
    it('should reject "password123"', () => {
      const result = validatePassword('password123')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('too common'))).toBe(true)
    })

    it('should reject "Password123" (case-insensitive)', () => {
      const result = validatePassword('Password123')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('too common'))).toBe(true)
    })

    it('should reject "qwerty123"', () => {
      const result = validatePassword('qwerty123')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('too common'))).toBe(true)
    })

    it('should reject "welcome1"', () => {
      const result = validatePassword('welcome1')
      expect(result.valid).toBe(false)
    })
  })

  describe('repeated characters', () => {
    it('should reject password with 4+ repeated characters', () => {
      const result = validatePassword('Pass1111word')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('repeated characters'))).toBe(true)
    })

    it('should accept password with 3 repeated characters', () => {
      const result = validatePassword('Pass111word')
      expect(result.valid).toBe(true)
    })
  })

  describe('sequential characters', () => {
    it('should reject password with sequential letters "abcd"', () => {
      const result = validatePassword('abcd1234')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('sequential'))).toBe(true)
    })

    it('should reject password with sequential numbers "1234"', () => {
      const result = validatePassword('xyz1234')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('sequential'))).toBe(true)
    })

    it('should reject password with reversed sequential "dcba"', () => {
      const result = validatePassword('dcba1234')
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('sequential'))).toBe(true)
    })

    it('should reject keyboard sequence "qwerty"', () => {
      const result = validatePassword('qwerty12')
      expect(result.valid).toBe(false)
    })
  })

  describe('non-string input', () => {
    it('should reject non-string input', () => {
      const result = validatePassword(null as unknown as string)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('string')
    })
  })

  describe('strength scoring', () => {
    it('should give score 4 to very strong password', () => {
      const result = validatePassword('Super$tr0ngP@ss2024')
      expect(result.score).toBe(4)
    })

    it('should give lower score to weaker (but valid) password', () => {
      const result = validatePassword('foo12bar')
      expect(result.score).toBeLessThan(4)
      expect(result.score).toBeGreaterThanOrEqual(1)
    })
  })
})
