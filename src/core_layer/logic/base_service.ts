import type { Logger } from './logger.js'

export abstract class BaseService {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  abstract initialize(): Promise<void>
  abstract execute(): Promise<void>
  abstract shutdown(): Promise<void>
}
