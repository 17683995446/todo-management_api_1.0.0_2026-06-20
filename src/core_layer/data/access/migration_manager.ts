import type { Logger } from '../../logic/logger.js'
import { NotFoundError } from '../../model/errors.js'
import type { BaseMigration } from './base_migration.js'

export class MigrationManager {
  private migrations: Map<string, BaseMigration> = new Map()
  private appliedVersions: Set<string> = new Set()
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace('MigrationManager initialized', {}, 12, 'constructor')
  }

  registerMigration(migration: BaseMigration): void {
    this.logger.trace(
      'MigrationManager.registerMigration called',
      { version: migration.version },
      16,
      'registerMigration',
    )
    this.migrations.set(migration.version, migration)
  }

  getSortedMigrations(): BaseMigration[] {
    this.logger.trace(
      'MigrationManager.getSortedMigrations called',
      { count: this.migrations.size },
      20,
      'getSortedMigrations',
    )
    return Array.from(this.migrations.values()).sort((a, b) =>
      a.version.localeCompare(b.version),
    )
  }

  async migrateTo(targetVersion?: string): Promise<void> {
    this.logger.trace(
      'MigrationManager.migrateTo called',
      { targetVersion },
      25,
      'migrateTo',
    )
    const sorted = this.getSortedMigrations()
    let targetIndex = sorted.length

    if (targetVersion) {
      this.logger.trace(
        'MigrationManager.migrateTo: searching for target',
        { targetVersion },
        29,
        'migrateTo',
      )
      const foundIndex = sorted.findIndex((m) => m.version === targetVersion)
      if (foundIndex === -1) {
        this.logger.error(
          'MigrationManager.migrateTo: version not found',
          { targetVersion },
          32,
          'migrateTo',
        )
        throw new NotFoundError('Migration', targetVersion)
      }
      targetIndex = foundIndex + 1
    }

    for (let i = 0; i < targetIndex; i++) {
      const migration = sorted[i]
      if (!this.appliedVersions.has(migration.version)) {
        this.logger.info(`Applying migration: ${migration.version}`)
        await migration.up()
        this.appliedVersions.add(migration.version)
        this.logger.trace(
          'MigrationManager.migrateTo: marked applied',
          { version: migration.version },
          42,
          'migrateTo',
        )
      } else {
        this.logger.trace(
          'MigrationManager.migrateTo: skipping already applied',
          { version: migration.version },
          44,
          'migrateTo',
        )
      }
    }

    this.logger.info('Migrations complete')
  }

  markApplied(version: string): void {
    this.logger.trace(
      'MigrationManager.markApplied called',
      { version },
      51,
      'markApplied',
    )
    this.appliedVersions.add(version)
  }
}
