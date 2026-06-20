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

class TestMigration3 extends BaseMigration {
  version = '003'
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
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'migration-test-logger')
    manager = new MigrationManager(logger)
  })

  it('should initialize successfully', () => {
    expect(manager).toBeInstanceOf(MigrationManager)
  })

  it('should get sorted migrations', () => {
    const m1 = new TestMigration1(logger)
    const m2 = new TestMigration2(logger)
    const m3 = new TestMigration3(logger)
    manager.registerMigration(m3)
    manager.registerMigration(m1)
    manager.registerMigration(m2)
    const sorted = manager.getSortedMigrations()
    expect(sorted.map(m => m.version)).toEqual(['001', '002', '003'])
  })

  it('should apply migrations in order', async () => {
    const m1 = new TestMigration1(logger)
    const m2 = new TestMigration2(logger)
    manager.registerMigration(m2)
    manager.registerMigration(m1)
    await manager.migrateTo()
    expect(m1.up).toHaveBeenCalledBefore(m2.up)
  })

  it('should not reapply already applied migrations', async () => {
    const m1 = new TestMigration1(logger)
    manager.registerMigration(m1)
    manager.markApplied('001')
    await manager.migrateTo()
    expect(m1.up).not.toHaveBeenCalled()
  })

  it('should migrate to specific version', async () => {
    const m1 = new TestMigration1(logger)
    const m2 = new TestMigration2(logger)
    const m3 = new TestMigration3(logger)
    manager.registerMigration(m1)
    manager.registerMigration(m2)
    manager.registerMigration(m3)
    await manager.migrateTo('002')
    expect(m1.up).toHaveBeenCalled()
    expect(m2.up).toHaveBeenCalled()
    expect(m3.up).not.toHaveBeenCalled()
  })

  it('should throw error when migrating to non-existent version', async () => {
    const m1 = new TestMigration1(logger)
    manager.registerMigration(m1)
    await expect(manager.migrateTo('999')).rejects.toThrow()
  })
})
