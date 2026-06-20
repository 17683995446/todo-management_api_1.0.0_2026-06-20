import type { Logger } from "./logger.js"

export type UseCaseRequest = Record<string, unknown>
export type UseCaseResponse = Record<string, unknown>

export abstract class BaseUseCase<
  TRequest extends UseCaseRequest,
  TResponse extends UseCaseResponse
> {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace("BaseUseCase initialized", {}, 15, "constructor")
  }

  abstract execute(request: TRequest): Promise<TResponse>
}
