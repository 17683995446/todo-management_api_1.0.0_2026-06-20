import { parse_config } from './core_layer/data/parse/config_parser.js'
import { get_env } from './core_layer/data/parse/env_loader.js'
import { ConsoleLogger } from './core_layer/logic/logger.js'
import { ShutdownManager } from './core_layer/logic/shutdown_manager.js'
import { CliInputHandler } from './presentation_layer/input/cli_input_handler.js'
import { CliOutputRenderer } from './presentation_layer/output/cli_output_renderer.js'
import type { AppConfig } from './core_layer/data/model/app_config.js'

async function main() {
  const env = get_env()
  // First create a temporary logger to parse config without logging level from config
  const tempConfig: AppConfig = {
    app: { name: 'temp', version: '0.0.0', debug: true },
    server: { host: 'localhost', port: 0 },
    database: { host: 'localhost', port: 0, name: '', user: '' },
    logging: { level: 'trace', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 }
  }
  const tempLogger = new ConsoleLogger(tempConfig, 'main-temp')
  const config = await parse_config(env, tempLogger)
  const logger = new ConsoleLogger(config, 'main')
  const shutdownManager = new ShutdownManager(logger)
  const inputHandler = new CliInputHandler()
  const outputRenderer = new CliOutputRenderer()

  logger.info('Application initialized', { env }, 30, 'main')

  shutdownManager.addHook(async () => {
    logger.info('Cleaning up resources', {}, 33, 'shutdown-hook')
    inputHandler.close()
  })

  await outputRenderer.render('Welcome! Type "exit" to quit.')
  let shouldContinue = true
  while (shouldContinue) {
    logger.trace('Waiting for user input', {}, 40, 'main-loop')
    const input = await inputHandler.readInput()
    logger.trace('Received user input', { input }, 42, 'main-loop')
    if (input.toLowerCase() === 'exit') {
      logger.info('User requested exit', {}, 44, 'main-loop')
      shouldContinue = false
      break
    }
    await outputRenderer.render(`You said: ${input}`)
  }

  await shutdownManager.shutdown()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
