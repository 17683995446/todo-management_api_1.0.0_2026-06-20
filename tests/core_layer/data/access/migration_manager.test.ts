import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MigrationManager } from '../../../../src/core_layer/data/access/migration_manager.js'
import { BaseMigration } from '../../../../src/core_layer/data/access/base_migration.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

class TestMigration1 extends BaseMigration {
  version = '001'
  up = vi.fn(async () => {})
  down = vi.fn(async () => {})
}

class TestMigration2 extends BaseMigration {
  version = '002'
  up = vi.fn(async () => {})
  down = vi.fn(async () => {})
}

describe('MigrationManager', () => {
  let manager: MigrationManager
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 8080 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'info', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig)
    manager = new MigrationManager(logger)
  })

  it('should apply migrations in order', async () => {
    const m1 = new TestMigration1()
    const m2 = new TestMigration2()
    manager.registerMigration(m2)
    manager.registerMigration(m1)
    await manager.migrateTo()
    expect(m1.up).toHaveBeenCalledBefore(m2.up)
  })

  it('should not reapply already applied migrations', async () => {
    const m1 = new TestMigration1()
    manager.registerMigration(m1)
    manager.markApplied('001')
    await manager.migrateTo()
    expect(m1.up).not.toHaveBeenCalled()
  })
})
