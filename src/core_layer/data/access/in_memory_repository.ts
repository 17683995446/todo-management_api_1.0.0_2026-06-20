import { randomUUID } from 'node:crypto'
import { BaseRepository, type BaseEntity } from './base_repository.js'

export class InMemoryRepository<T extends BaseEntity> extends BaseRepository<T> {
  private entities: Map<string, T> = new Map()

  async findAll(): Promise<T[]> {
    this.logger.trace("InMemoryRepository.findAll called", {}, 13, "findAll")
    const result = Array.from(this.entities.values())
    this.logger.trace("InMemoryRepository.findAll returning", { count: result.length }, 15, "findAll")
    return result
  }

  async findById(id: string): Promise<T | null> {
    this.logger.trace("InMemoryRepository.findById called", { id }, 18, "findById")
    const result = this.entities.get(id) || null
    this.logger.trace("InMemoryRepository.findById returning", { found: !!result }, 20, "findById")
    return result
  }

  async create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    this.logger.trace("InMemoryRepository.create called", { entity }, 23, "create")
    const now = new Date()
    const newEntity = {
      ...entity,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    } as T
    this.entities.set(newEntity.id, newEntity)
    this.logger.trace("InMemoryRepository.create returning", { id: newEntity.id }, 31, "create")
    return newEntity
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T | null> {
    this.logger.trace("InMemoryRepository.update called", { id, updates }, 34, "update")
    const existing = this.entities.get(id)
    if (!existing) {
      this.logger.trace("InMemoryRepository.update: not found", { id }, 37, "update")
      return null
    }
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    } as T
    this.entities.set(id, updated)
    this.logger.trace("InMemoryRepository.update returning", { id: updated.id }, 44, "update")
    return updated
  }

  async delete(id: string): Promise<boolean> {
    this.logger.trace("InMemoryRepository.delete called", { id }, 47, "delete")
    const result = this.entities.delete(id)
    this.logger.trace("InMemoryRepository.delete returning", { deleted: result }, 49, "delete")
    return result
  }
}
