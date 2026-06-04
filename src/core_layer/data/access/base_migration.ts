export abstract class BaseMigration {
  abstract version: string
  abstract up(): Promise<void>
  abstract down(): Promise<void>
}
