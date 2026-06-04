import { parse_config } from './core_layer/data/parse/config_parser.js'
import { get_env } from './core_layer/data/parse/env_loader.js'
import { ConsoleLogger } from './core_layer/logic/logger.js'
import { ShutdownManager } from './core_layer/logic/shutdown_manager.js'
import { CliInputHandler } from './presentation_layer/input/cli_input_handler.js'
import { CliOutputRenderer } from './presentation_layer/output/cli_output_renderer.js'
import type { AppConfig } from './core_layer/data/model/app_config.js'

async function main() {
  const env = get_env()
  const config: AppConfig = parse_config(env)
  const logger = new ConsoleLogger(config)
  const shutdownManager = new ShutdownManager(logger)
  const inputHandler = new CliInputHandler()
  const outputRenderer = new CliOutputRenderer()

  logger.info('Application initialized', { env })

  shutdownManager.addHook(async () => {
    logger.info('Cleaning up resources')
    inputHandler.close()
  })

  // Example interaction
  await outputRenderer.render('Welcome! Type "exit" to quit.')
  let shouldContinue = true
  while (shouldContinue) {
    const input = await inputHandler.readInput()
    if (input.toLowerCase() === 'exit') {
      shouldContinue = false
      break
    }
    await outputRenderer.render(`You said: ${input}`)
  }

  await shutdownManager.shutdown()
}

main().catch(console.error)
