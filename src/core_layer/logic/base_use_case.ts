export interface UseCaseRequest {}
export interface UseCaseResponse {}

export abstract class BaseUseCase<
  TRequest extends UseCaseRequest,
  TResponse extends UseCaseResponse
> {
  abstract execute(request: TRequest): Promise<TResponse>
}
