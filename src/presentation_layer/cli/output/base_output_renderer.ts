import type { Logger } from "../../../core_layer/logic/logger.js"

export abstract class BaseOutputRenderer {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace("BaseOutputRenderer initialized", {}, 9, "constructor")
  }

  abstract render(data: unknown): Promise<void>
}
