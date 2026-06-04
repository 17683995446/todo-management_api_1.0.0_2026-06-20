import { BaseInputHandler } from './base_input_handler.js'
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export class CliInputHandler extends BaseInputHandler {
  private rl: readline.Interface

  constructor() {
    super()
    this.rl = readline.createInterface({ input: stdin, output: stdout })
  }

  async readInput(): Promise<string> {
    const input = await this.rl.question('> ')
    return input.trim()
  }

  close(): void {
    this.rl.close()
  }
}
