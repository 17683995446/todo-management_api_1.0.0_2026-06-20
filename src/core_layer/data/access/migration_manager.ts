import type { BaseMigration } from './base_migration.js'
import type { Logger } from '../../logic/logger.js'

export class MigrationManager {
  private migrations: Map<string, BaseMigration> = new Map()
  private appliedVersions: Set<string> = new Set()
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  registerMigration(migration: BaseMigration): void {
    this.migrations.set(migration.version, migration)
  }

  getSortedMigrations(): BaseMigration[] {
    return Array.from(this.migrations.values()).sort((a, b) => a.version.localeCompare(b.version))
  }

  async migrateTo(targetVersion?: string): Promise<void> {
    const sorted = this.getSortedMigrations()
    let targetIndex = sorted.length

    if (targetVersion) {
      targetIndex = sorted.findIndex(m => m.version === targetVersion)
      if (targetIndex === -1) {
        throw new Error(`Migration version ${targetVersion} not found`)
      }
    }

    for (let i = 0; i < targetIndex; i++) {
      const migration = sorted[i]
      if (!this.appliedVersions.has(migration.version)) {
        this.logger.info(`Applying migration: ${migration.version}`)
        await migration.up()
        this.appliedVersions.add(migration.version)
      }
    }

    this.logger.info('Migrations complete')
  }

  markApplied(version: string): void {
    this.appliedVersions.add(version)
  }
}
