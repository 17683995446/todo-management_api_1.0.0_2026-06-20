import { BaseUseCase, type UseCaseRequest, type UseCaseResponse } from './base_use_case.js'
import type { AppConfig } from '../data/model/app_config.js'
import type { Logger } from './logger.js'

export interface GetConfigRequest extends UseCaseRequest {
  env: string
}

export interface GetConfigResponse extends UseCaseResponse {
  config: AppConfig
}

export class GetConfigUseCase extends BaseUseCase<GetConfigRequest, GetConfigResponse> {
  private parseConfig: (env: string) => Promise<AppConfig>
  private logger: Logger

  constructor(parseConfig: (env: string) => Promise<AppConfig>, logger: Logger) {
    super()
    this.parseConfig = parseConfig
    this.logger = logger
  }

  async execute(request: GetConfigRequest): Promise<GetConfigResponse> {
    this.logger.debug('Executing GetConfigUseCase', { env: request.env })
    const config = await this.parseConfig(request.env)
    return { config }
  }
}
