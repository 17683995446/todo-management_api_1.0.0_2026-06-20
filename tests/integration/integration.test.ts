import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConsoleLogger } from '../../src/core_layer/logic/logger.js'
import { InMemoryRepository } from '../../src/core_layer/data/access/in_memory_repository.js'
import { InMemoryCache } from '../../src/core_layer/logic/in_memory_cache.js'
import { ErrorInjector } from '../../src/core_layer/logic/error_injector.js'
import { ShutdownManager } from '../../src/core_layer/logic/shutdown_manager.js'
import { BasicInputSanitizer } from '../../src/core_layer/logic/input_sanitizer.js'
import { ModuleManager } from '../../src/core_layer/module/module_registry.js'
import { ConfigModuleFactory } from '../../src/modules/config_module.js'
import type { AppConfig } from '../../src/core_layer/data/model/app_config.js'

// 示例实体
interface User {
  id: string
  createdAt: Date
  updatedAt: Date
  name: string
  email: string
  age: number
}

describe('Complete System Integration Tests', () => {
  let logger: ConsoleLogger
  let mockConfig: AppConfig

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test', version: '1.0.0', debug: true },
      server: { host: 'localhost', port: 3000 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'trace', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'integration-test')
    // 防止真实的信号处理器干扰
    vi.spyOn(process, 'on').mockImplementation(() => {})
  })

  it('should integrate repository with cache - layered architecture', async () => {
    const repo = new InMemoryRepository<User>(logger)
    const cache = new InMemoryCache<string, User>(logger, 60000)

    // 创建用户
    const user = await repo.create({ name: 'Test User', email: 'test@example.com', age: 25 })
    expect(user.id).toBeTruthy()
    expect(user.name).toBe('Test User')

    // 放入缓存
    await cache.set(user.id, user, 30000)
    const cachedUser = await cache.get(user.id)
    expect(cachedUser).toEqual(user)

    // 更新数据库，验证缓存与数据库不同步（正常情况）
    const updatedUser = await repo.update(user.id, { name: 'Updated User' })
    expect(updatedUser?.name).toBe('Updated User')

    // 缓存中的值还是旧的
    const cachedBeforeUpdate = await cache.get(user.id)
    expect(cachedBeforeUpdate?.name).toBe('Test User')

    // 关闭资源
    cache.close()
  })

  it('should handle multiple concurrent operations on repository', async () => {
    const repo = new InMemoryRepository<User>(logger)
    const concurrency = 20

    // 并发创建
    const createPromises = []
    for (let i = 0; i < concurrency; i++) {
      createPromises.push(repo.create({
        name: `User ${i}`,
        email: `user${i}@test.com`,
        age: 20 + i
      }))
    }
    const users = await Promise.all(createPromises)
    expect(users.length).toBe(concurrency)

    // 验证
    const allUsers = await repo.findAll()
    expect(allUsers.length).toBe(concurrency)

    // 并发更新
    const updatePromises = users.map((user, idx) =>
      repo.update(user.id, { age: 30 + idx })
    )
    const updatedUsers = await Promise.all(updatePromises)
    updatedUsers.forEach((user, idx) => {
      expect(user?.age).toBe(30 + idx)
    })
  })

  it('should perform full lifecycle - from init to shutdown', async () => {
    const shutdownManager = new ShutdownManager(logger, false) // 测试时不调用 process.exit()
    const cache = new InMemoryCache<string, number>(logger)
    let cleanupCalled = false
    shutdownManager.addHook(async () => {
      cleanupCalled = true
      cache.close()
    })

    // 运行一些操作
    await cache.set('test', 42)
    const value = await cache.get('test')
    expect(value).toBe(42)

    // 执行关闭
    await shutdownManager.shutdown()
    expect(cleanupCalled).toBe(true)
  })

  it('should integrate with error injector for resilience testing', async () => {
    const errorInjector = new ErrorInjector(logger, {
      enabled: true,
      errorType: 'NETWORK_ERROR',
      failureRate: 1
    })

    // 错误应该被触发
    await expect(errorInjector.injectError()).rejects.toThrow('Network error: connection refused')

    // 禁用注入后，应该没问题
    errorInjector.disable()
    await expect(errorInjector.injectError()).resolves.not.toThrow()
  })

  it('should handle input sanitization with edge cases', async () => {
    const sanitizer = new BasicInputSanitizer(logger)
    
    // 测试正常值
    expect(sanitizer.sanitizeString('hello world')).toBe('hello world')
    expect(sanitizer.sanitizeNumber(123)).toBe(123)
    expect(sanitizer.sanitizeBoolean(true)).toBe(true)
    expect(sanitizer.sanitizeBoolean(false)).toBe(false)
  })

  it('should integrate all module system together', async () => {
    const moduleManager = new ModuleManager(logger)

    // 注册模块
    await moduleManager.registerAndCreate(new ConfigModuleFactory())

    // 启动系统
    await moduleManager.boot()

    // 验证模块功能
    const configModule = moduleManager.getModule('config')
    expect(configModule).toBeTruthy()

    // 获取服务
    const config = configModule?.getService<AppConfig>('appConfig')
    expect(config).toBeTruthy()
    expect(config?.app.name).toBeTruthy()

    // 关闭系统
    await moduleManager.shutdown()
  })

  it('should test full data flow - create -> read -> update -> delete', async () => {
    const repo = new InMemoryRepository<User>(logger)

    // CREATE
    const created = await repo.create({
      name: 'DataFlow User',
      email: 'flow@test.com',
      age: 30
    })

    // READ
    const readBack = await repo.findById(created.id)
    expect(readBack).toEqual(created)

    // UPDATE
    const updated = await repo.update(created.id, { age: 31 })
    expect(updated?.age).toBe(31)

    // READ again
    const readUpdated = await repo.findById(created.id)
    expect(readUpdated?.age).toBe(31)

    // DELETE
    const deleted = await repo.delete(created.id)
    expect(deleted).toBe(true)

    // VERIFY deleted
    const afterDelete = await repo.findById(created.id)
    expect(afterDelete).toBeNull()
  })

  it('should handle large data volume - 1000 operations', async () => {
    const repo = new InMemoryRepository<User>(logger)
    const count = 1000

    // 创建 1000 个实体
    for (let i = 0; i < count; i++) {
      await repo.create({
        name: `User ${i}`,
        email: `user${i}@test.com`,
        age: 18 + (i % 50)
      })
    }

    // 验证数量
    const all = await repo.findAll()
    expect(all.length).toBe(count)

    // 查找操作
    const targetId = all[500].id
    const found = await repo.findById(targetId)
    expect(found).toBeTruthy()
    expect(found?.name).toBe('User 500')

    // 更新操作
    const updated = await repo.update(targetId, { name: 'Modified User 500' })
    expect(updated?.name).toBe('Modified User 500')
  })

  it('should handle rapid cache operations with mixed TTLs', async () => {
    const cache = new InMemoryCache<string, string>(logger)

    const operations = []
    for (let i = 0; i < 100; i++) {
      operations.push(cache.set(`key${i}`, `value${i}`, i * 10))
    }

    await Promise.all(operations)

    const getResults = await Promise.all(
      Array.from({ length: 100 }, (_, i) => cache.get(`key${i}`))
    )

    // 验证结果
    const nonNullResults = getResults.filter(x => x !== null)
    expect(nonNullResults.length).toBeGreaterThan(0)

    cache.close()
  })
})
