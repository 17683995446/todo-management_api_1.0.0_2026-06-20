export abstract class BaseInputHandler {
  abstract readInput(): Promise<string>
}
