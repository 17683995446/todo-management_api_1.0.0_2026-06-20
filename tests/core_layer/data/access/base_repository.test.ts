import { describe, it, expect, beforeEach } from 'vitest'
import { BaseRepository, type BaseEntity } from '../../../../src/core_layer/data/access/base_repository.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

class TestEntity implements BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
  name: string
}

class TestRepository extends BaseRepository<TestEntity> {
  async findAll(): Promise<TestEntity[]> { return [] }
  async findById(id: string): Promise<TestEntity | null> { return null }
  async create(entity: Partial<TestEntity>): Promise<TestEntity> { return { id: '1', createdAt: new Date(), updatedAt: new Date(), name: 'test' } }
  async update(id: string, entity: Partial<TestEntity>): Promise<TestEntity | null> { return { id: '1', createdAt: new Date(), updatedAt: new Date(), name: 'updated' } }
  async delete(id: string): Promise<boolean> { return true }
}

describe('BaseRepository', () => {
  let test_repository: TestRepository
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
    logger = new ConsoleLogger(mock_config, 'test_repo_logger')
    test_repository = new TestRepository(logger)
  })

  it('should initialize successfully', () => {
    expect(test_repository).toBeInstanceOf(TestRepository)
  })
})
