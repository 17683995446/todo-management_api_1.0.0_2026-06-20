import { z } from 'zod'
import type { Logger } from '../../logic/logger.js'
import { ConfigError, ErrorCode } from '../../model/errors.js'
import type { AppConfig } from '../model/app_config.js'

const AppConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string(),
    debug: z.boolean(),
  }),
  server: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535),
  }),
  database: z
    .object({
      host: z.string(),
      port: z.number().int().min(1).max(65535),
      name: z.string(),
      user: z.string(),
    })
    .optional(),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'text']),
  }),
  api: z.object({
    timeout: z.number().int().min(1000),
    rate_limit: z.number().int().min(1),
  }),
})

/**
 * 将 Zod 校验错误格式化为人类可读的提示信息
 */
function formatZodError(env: string, issues: z.ZodIssue[]): string {
  const lines = issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : '(根)'
    return `  - ${field}: ${issue.message}`
  })
  return `配置校验失败: config/${env}.yaml\n${lines.join('\n')}\n请检查上述字段是否符合 schema 要求。`
}

export function validate_config(
  config: unknown,
  logger?: Logger,
  env = 'development',
): AppConfig {
  logger?.trace('validate_config called', {}, 31, 'validate_config')
  try {
    const validated = AppConfigSchema.parse(config)
    logger?.trace('validate_config succeeded', {}, 33, 'validate_config')
    return validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      const msg = formatZodError(env, error.errors)
      logger?.error(
        'validate_config failed',
        { env, issues: error.errors },
        36,
        'validate_config',
      )
      throw new ConfigError(msg, ErrorCode.CONFIG_VALIDATION_FAILED, {
        env,
        issues: error.errors,
      })
    }
    const msg = error instanceof Error ? error.message : String(error)
    logger?.error(
      'validate_config failed',
      { error: msg, env },
      38,
      'validate_config',
    )
    throw new ConfigError(
      `配置校验失败: ${msg}`,
      ErrorCode.CONFIG_VALIDATION_FAILED,
      { env },
    )
  }
}
