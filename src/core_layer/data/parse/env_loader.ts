import type { Logger } from '../../logic/logger.js'
import { ConfigError, ErrorCode } from '../../model/errors.js'

export function get_env_var(
  key: string,
  defaultValue?: string,
  logger?: Logger,
): string {
  logger?.trace(
    'get_env_var called',
    { key, hasDefault: !!defaultValue },
    4,
    'get_env_var',
  )
  const value = process.env[key]
  if (value !== undefined) {
    logger?.trace(
      'get_env_var using environment value',
      { key },
      7,
      'get_env_var',
    )
    return value
  }
  if (defaultValue !== undefined) {
    logger?.trace(
      'get_env_var using default value',
      { key, defaultValue },
      10,
      'get_env_var',
    )
    return defaultValue
  }
  logger?.error('get_env_var: variable not set', { key }, 13, 'get_env_var')
  throw new ConfigError(
    `Environment variable ${key} is not set`,
    ErrorCode.CONFIG_LOAD_FAILED,
    { key },
  )
}

export function get_env(logger?: Logger): string {
  logger?.trace('get_env called', {}, 17, 'get_env')
  return get_env_var('NODE_ENV', 'development', logger)
}
