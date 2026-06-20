import type { Logger } from "../../logic/logger.js";

export abstract class BaseMigration {
  protected logger: Logger
  abstract version: string

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace("BaseMigration initialized", { version: this.constructor.name }, 9, "constructor")
  }

  abstract up(): Promise<void>
  abstract down(): Promise<void>
}
