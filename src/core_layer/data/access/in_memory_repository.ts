import { randomUUID } from 'node:crypto'
import { BaseRepository, type BaseEntity } from './base_repository.js'

export class InMemoryRepository<T extends BaseEntity> extends BaseRepository<T> {
  private entities: Map<string, T> = new Map()

  async findAll(): Promise<T[]> {
    return Array.from(this.entities.values())
  }

  async findById(id: string): Promise<T | null> {
    return this.entities.get(id) || null
  }

  async create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const now = new Date()
    const newEntity = {
      ...entity,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    } as T
    this.entities.set(newEntity.id, newEntity)
    return newEntity
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T | null> {
    const existing = this.entities.get(id)
    if (!existing) {
      return null
    }
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    } as T
    this.entities.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.entities.delete(id)
  }
}
