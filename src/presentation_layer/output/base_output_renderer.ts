export abstract class BaseOutputRenderer {
  abstract render(data: unknown): Promise<void>
}
