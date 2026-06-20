import { describe, it, expect, beforeEach } from 'vitest'
import { BaseMigration } from '../../../../src/core_layer/data/access/base_migration.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

class TestMigration extends BaseMigration {
  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

describe('BaseMigration', () => {
  let test_migration: TestMigration
  let logger: ConsoleLogger
  let mock_config: AppConfig

  beforeEach(() => {
    mock_config = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mock_config, 'test_migration_logger')
    test_migration = new TestMigration(logger)
  })

  it('should initialize successfully', () => {
    expect(test_migration).toBeInstanceOf(TestMigration)
  })
})
