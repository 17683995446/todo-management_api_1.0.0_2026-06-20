import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryRepository } from '../../../../src/core_layer/data/access/in_memory_repository.js'
import type { BaseEntity } from '../../../../src/core_layer/data/access/base_repository.js'

interface TestEntity extends BaseEntity {
  name: string
}

describe('InMemoryRepository', () => {
  let repo: InMemoryRepository<TestEntity>

  beforeEach(() => {
    repo = new InMemoryRepository<TestEntity>()
  })

  it('should create an entity', async () => {
    const entity = await repo.create({ name: 'test' })
    expect(entity.id).toBeDefined()
    expect(entity.name).toEqual('test')
  })

  it('should find all entities', async () => {
    await repo.create({ name: 'test1' })
    await repo.create({ name: 'test2' })
    const all = await repo.findAll()
    expect(all.length).toEqual(2)
  })

  it('should update an entity', async () => {
    const created = await repo.create({ name: 'original' })
    const updated = await repo.update(created.id, { name: 'updated' })
    expect(updated?.name).toEqual('updated')
  })

  it('should delete an entity', async () => {
    const created = await repo.create({ name: 'to delete' })
    const deleted = await repo.delete(created.id)
    expect(deleted).toBe(true)
    const found = await repo.findById(created.id)
    expect(found).toBeNull()
  })
})
