import { parse_config } from './core_layer/data/parse/config_parser.js'
import { get_env } from './core_layer/data/parse/env_loader.js'
import { ConsoleLogger } from './core_layer/logic/logger.js'

async function main() {
  const env = get_env()
  console.log(`Starting application in ${env} mode`)
  const config = parse_config(env)
  const logger = new ConsoleLogger(config)
  logger.info('Application initialized')
}

main().catch(console.error)
