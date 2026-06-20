import type { Logger } from "../../../core_layer/logic/logger.js"

export abstract class BaseInputHandler {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace("BaseInputHandler initialized", {}, 9, "constructor")
  }

  abstract readInput(): Promise<string>
}
