import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'yaml'
import type { AppConfig } from '../model/app_config.js'
import { validate_config } from './config_validator.js'
import type { Logger } from '../../logic/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CONFIG_DIR = path.resolve(__dirname, '../../../../config')

export async function parse_config(env: string, logger?: Logger): Promise<AppConfig> {
  const localLogger = logger || null
  localLogger?.trace('parse_config called', { env }, 16, 'parse_config')

  try {
    const file_path = path.join(CONFIG_DIR, `${env}.yaml`)
    localLogger?.trace('Constructed config file path', { env, path: file_path }, 19, 'parse_config')

    const content = await fs.readFile(file_path, 'utf8')
    localLogger?.trace('Successfully read config file', { path: file_path, length: content.length }, 22, 'parse_config')

    const raw_config = yaml.parse(content)
    localLogger?.trace('Parsed YAML config', { raw_config: raw_config }, 25, 'parse_config')

    const validated = validate_config(raw_config)
    localLogger?.trace('Validated config', { validated }, 28, 'parse_config')

    return validated
  } catch (err: any) {
    localLogger?.error('Failed to parse config', { error: err, env }, 33, 'parse_config')
    throw err
  }
}
