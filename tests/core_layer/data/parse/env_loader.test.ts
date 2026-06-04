import { describe, it, expect, beforeEach } from 'vitest'
import { get_env_var, get_env } from '../../../../src/core_layer/data/parse/env_loader.js'

describe('env_loader', () => {
  beforeEach(() => {
    delete process.env.TEST_ENV
    delete process.env.NODE_ENV
  })

  it('should get existing env var', () => {
    process.env.TEST_ENV = 'test_value'
    expect(get_env_var('TEST_ENV')).toEqual('test_value')
  })

  it('should return default when var not set', () => {
    expect(get_env_var('NON_EXISTENT', 'default_val')).toEqual('default_val')
  })

  it('should throw when no default and not set', () => {
    expect(() => get_env_var('NON_EXISTENT')).toThrow()
  })

  it('should get NODE_ENV with default dev', () => {
    expect(get_env()).toEqual('development')
  })
})
