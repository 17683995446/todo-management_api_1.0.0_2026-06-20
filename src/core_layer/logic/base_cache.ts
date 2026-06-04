export abstract class BaseCache<K, V> {
  abstract get(key: K): Promise<V | null>
  abstract set(key: K, value: V, ttl?: number): Promise<void>
  abstract delete(key: K): Promise<boolean>
  abstract clear(): Promise<void>
}
