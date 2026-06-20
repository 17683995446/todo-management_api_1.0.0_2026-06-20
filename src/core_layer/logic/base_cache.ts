import type { Logger } from "./logger.js";

export abstract class BaseCache<K, V> {
  protected logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.logger.trace("BaseCache initialized", {}, 9, "constructor")
  }

  abstract get(key: K): Promise<V | null>
  abstract set(key: K, value: V, ttl?: number): Promise<void>
  abstract delete(key: K): Promise<boolean>
  abstract clear(): Promise<void>
  abstract close(): void
}
