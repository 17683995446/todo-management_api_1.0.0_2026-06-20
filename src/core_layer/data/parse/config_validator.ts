import { z } from 'zod'
import type { AppConfig } from '../model/app_config.js'

const AppConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string(),
    debug: z.boolean()
  }),
  server: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535)
  }),
  database: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535),
    name: z.string(),
    user: z.string()
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'text'])
  }),
  api: z.object({
    timeout: z.number().int().min(1000),
    rate_limit: z.number().int().min(1)
  })
})

export function validate_config(config: unknown): AppConfig {
  return AppConfigSchema.parse(config)
}
