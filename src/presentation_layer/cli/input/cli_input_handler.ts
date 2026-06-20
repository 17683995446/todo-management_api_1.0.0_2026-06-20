import { BaseInputHandler } from './base_input_handler.js'
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import type { Logger } from "../../../core_layer/logic/logger.js"

export class CliInputHandler extends BaseInputHandler {
  private rl: readline.Interface

  constructor(logger: Logger) {
    super(logger)
    this.rl = readline.createInterface({ input: stdin, output: stdout })
  }

  async readInput(): Promise<string> {
    this.logger.trace("CliInputHandler.readInput called", {}, 19, "readInput")
    const input = await this.rl.question('> ')
    const trimmed = input.trim()
    this.logger.trace("CliInputHandler.readInput returning", { input: trimmed }, 22, "readInput")
    return trimmed
  }

  close(): void {
    this.logger.trace("CliInputHandler.close called", {}, 26, "close")
    this.rl.close()
  }
}
