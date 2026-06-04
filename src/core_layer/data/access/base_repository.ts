export interface BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
}

export abstract class BaseRepository<T extends BaseEntity> {
  abstract findAll(): Promise<T[]>
  abstract findById(id: string): Promise<T | null>
  abstract create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>
  abstract update(id: string, entity: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T | null>
  abstract delete(id: string): Promise<boolean>
}
