import { BaseUseCase, type UseCaseRequest, type UseCaseResponse } from './base_use_case.js'
import type { AppConfig } from '../data/model/app_config.js'
import type { Logger } from './logger.js'
import { parse_config } from '../data/parse/config_parser.js'

export interface GetConfigRequest extends UseCaseRequest {
  env: string
}

export interface GetConfigResponse extends UseCaseResponse {
  config: AppConfig
}

export class GetConfigUseCase extends BaseUseCase<GetConfigRequest, GetConfigResponse> {
  private logger: Logger

  constructor(logger: Logger) {
    super()
    this.logger = logger
    this.logger.trace('GetConfigUseCase initialized', {}, 21, 'constructor')
  }

  async execute(request: GetConfigRequest): Promise<GetConfigResponse> {
    this.logger.trace('GetConfigUseCase.execute called', { request }, 24, 'execute')
    this.logger.debug('Executing GetConfigUseCase', { env: request.env }, 25, 'execute')
    const config = await parse_config(request.env, this.logger)
    this.logger.trace('GetConfigUseCase.execute returning config', { config }, 27, 'execute')
    return { config }
  }
}
