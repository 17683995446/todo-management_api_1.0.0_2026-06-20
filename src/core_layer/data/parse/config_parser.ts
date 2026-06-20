import { readdirSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'
import type { Logger } from '../../logic/logger.js'
import { ConfigError, ErrorCode } from '../../model/errors.js'
import type { AppConfig } from '../model/app_config.js'
import { validate_config } from './config_validator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CONFIG_DIR = path.resolve(__dirname, '../../../../config')

/**
 * 列出 config 目录下所有可用的环境配置文件名（不含 .yaml 后缀）
 */
function listAvailableEnvs(): string[] {
  try {
    const files = readdirSync(CONFIG_DIR)
    return files
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => f.replace(/\.yaml$/, ''))
      .sort()
  } catch {
    return []
  }
}

export async function parse_config(
  env: string,
  logger?: Logger,
): Promise<AppConfig> {
  const localLogger = logger
  localLogger?.trace('parse_config called', { env }, 17, 'parse_config')

  const file_path = path.join(CONFIG_DIR, `${env}.yaml`)
  localLogger?.trace(
    'Constructed config file path',
    { env, path: file_path },
    20,
    'parse_config',
  )

  let content: string
  try {
    content = await fs.readFile(file_path, 'utf8')
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'ENOENT') {
      const available = listAvailableEnvs()
      const availableStr =
        available.length > 0 ? available.join(', ') : '（无）'
      const msg = `配置文件不存在: config/${env}.yaml\n可用环境: ${availableStr}\n请设置 NODE_ENV 为上述环境之一，或在 config/ 目录下创建 ${env}.yaml 文件。`
      localLogger?.error(
        'Config file not found',
        { env, path: file_path, available },
        30,
        'parse_config',
      )
      throw new ConfigError(msg, ErrorCode.CONFIG_LOAD_FAILED, {
        env,
        available,
      })
    }
    const msg = err instanceof Error ? err.message : String(err)
    localLogger?.error(
      'Failed to read config file',
      { error: msg, path: file_path },
      34,
      'parse_config',
    )
    throw new ConfigError(
      `读取配置文件失败: ${msg}`,
      ErrorCode.CONFIG_LOAD_FAILED,
      { path: file_path },
    )
  }

  localLogger?.trace(
    'Successfully read config file',
    { path: file_path, length: content.length },
    23,
    'parse_config',
  )

  let raw_config: unknown
  try {
    raw_config = yaml.parse(content)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    localLogger?.error(
      'YAML parse failed',
      { error: msg, path: file_path },
      28,
      'parse_config',
    )
    throw new ConfigError(
      `配置文件 YAML 解析失败: config/${env}.yaml\n${msg}\n请检查 YAML 语法（缩进、冒号后空格等）。`,
      ErrorCode.CONFIG_PARSE_FAILED,
      { path: file_path },
    )
  }

  localLogger?.trace(
    'Parsed YAML config',
    { raw_config: raw_config },
    26,
    'parse_config',
  )

  const validated = validate_config(raw_config, localLogger, env)
  localLogger?.trace('Validated config', { validated }, 29, 'parse_config')

  return validated
}
