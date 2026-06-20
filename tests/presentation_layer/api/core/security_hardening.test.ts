import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HonoApiServer } from '../../../../src/presentation_layer/api/core/hono_api.js'
import { ConsoleLogger } from '../../../../src/core_layer/logic/logger.js'
import { SqliteRepository } from '../../../../src/core_layer/data/access/sqlite_repository.js'
import { AuthService } from '../../../../src/core_layer/logic/auth_service.js'
import { TelemetryManager } from '../../../../src/core_layer/telemetry/telemetry_context.js'
import { SlidingWindowRateLimiter } from '../../../../src/core_layer/logic/rate_limiter.js'
import { todoSqliteConfig, type Todo } from '../../../../src/core_layer/model/todo.js'
import { userSqliteConfig, type User } from '../../../../src/core_layer/model/user.js'
import type { AppConfig } from '../../../../src/core_layer/data/model/app_config.js'

/**
 * Phase 7: 生产加固测试
 * - 安全响应头
 * - 限流（429 + Retry-After）
 * - 密码策略（弱密码拒绝）
 */
describe('Phase 7: Production Hardening', () => {
  let mockConfig: AppConfig
  let logger: ConsoleLogger
  let todoRepo: SqliteRepository<Todo>
  let userRepo: SqliteRepository<User>
  let authService: AuthService
  let telemetry: TelemetryManager
  let rateLimiter: SlidingWindowRateLimiter
  let server: HonoApiServer
  let dbPath: string

  beforeEach(() => {
    mockConfig = {
      app: { name: 'test-hardening', version: '1.0.0', debug: true },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(mockConfig, 'hardening-test')
    dbPath = join(tmpdir(), `test-hardening-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    todoRepo = new SqliteRepository<Todo>(logger, dbPath, todoSqliteConfig)
    userRepo = new SqliteRepository<User>(logger, dbPath, userSqliteConfig)
    authService = new AuthService(logger, 'test-secret')
    telemetry = new TelemetryManager(mockConfig.app.name, mockConfig.app.version)
    // 每分钟只允许 3 次（便于测试）
    rateLimiter = new SlidingWindowRateLimiter(logger, 60_000, 3)
    server = new HonoApiServer(mockConfig, logger, todoRepo, userRepo, authService, telemetry, undefined, rateLimiter)
  })

  afterEach(async () => {
    await server.stop().catch(() => {})
    todoRepo.close()
    userRepo.close()
    if (existsSync(dbPath)) rmSync(dbPath)
  })

  describe('Security Headers', () => {
    it('should set X-Content-Type-Options: nosniff', async () => {
      const res = await server.getApp().request('/health')
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })

    it('should set X-Frame-Options: DENY', async () => {
      const res = await server.getApp().request('/health')
      expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('should set Referrer-Policy', async () => {
      const res = await server.getApp().request('/health')
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })

    it('should set X-XSS-Protection', async () => {
      const res = await server.getApp().request('/health')
      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block')
    })

    it('should set Content-Security-Policy', async () => {
      const res = await server.getApp().request('/health')
      const csp = res.headers.get('Content-Security-Policy')
      expect(csp).not.toBeNull()
      expect(csp).toContain("default-src 'self'")
    })

    it('should set Cross-Origin-Opener-Policy', async () => {
      const res = await server.getApp().request('/health')
      expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
    })

    it('should set Permissions-Policy', async () => {
      const res = await server.getApp().request('/health')
      const pp = res.headers.get('Permissions-Policy')
      expect(pp).not.toBeNull()
      expect(pp).toContain('geolocation=()')
    })

    it('should NOT set HSTS by default (enableHsts=false)', async () => {
      const res = await server.getApp().request('/health')
      expect(res.headers.get('Strict-Transport-Security')).toBeNull()
    })

    it('should apply security headers to all routes including 404', async () => {
      const res = await server.getApp().request('/nonexistent-path')
      expect(res.status).toBe(404)
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    })
  })

  describe('Rate Limiting', () => {
    it('should allow requests under limit', async () => {
      const res1 = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user1', password: 'TestPass99!' })
      })
      const res2 = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user2', password: 'TestPass99!' })
      })
      const res3 = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user3', password: 'TestPass99!' })
      })
      expect(res1.status).toBe(201)
      expect(res2.status).toBe(201)
      expect(res3.status).toBe(201)
    })

    it('should return 429 when rate limit exceeded', async () => {
      // 用尽 3 次配额
      await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user1', password: 'TestPass99!' })
      })
      await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user2', password: 'TestPass99!' })
      })
      await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user3', password: 'TestPass99!' })
      })
      // 第 4 次应被限流
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user4', password: 'TestPass99!' })
      })
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Too Many Requests')
    })

    it('should include Retry-After header on 429', async () => {
      // 用尽配额
      for (let i = 0; i < 3; i++) {
        await server.getApp().request('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: `xxuser${i}`, password: 'TestPass99!' })
        })
      }
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'xxuser4', password: 'TestPass99!' })
      })
      expect(res.status).toBe(429)
      const retryAfter = res.headers.get('Retry-After')
      expect(retryAfter).not.toBeNull()
      expect(Number.parseInt(retryAfter ?? '0', 10)).toBeGreaterThan(0)
    })

    it('should skip rate limit for /health', async () => {
      // 用尽配额
      for (let i = 0; i < 3; i++) {
        await server.getApp().request('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: `hhuser${i}`, password: 'TestPass99!' })
        })
      }
      // /health 应不受限流影响
      const res = await server.getApp().request('/health')
      expect(res.status).toBe(200)
    })

    it('should isolate rate limit by IP (X-Forwarded-For)', async () => {
      // IP-A 用尽配额
      for (let i = 0; i < 3; i++) {
        await server.getApp().request('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '1.2.3.4'
          },
          body: JSON.stringify({ username: `aauser${i}`, password: 'TestPass99!' })
        })
      }
      // IP-A 第 4 次应被限流
      const resA = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '1.2.3.4'
        },
        body: JSON.stringify({ username: 'aauser4', password: 'TestPass99!' })
      })
      expect(resA.status).toBe(429)

      // IP-B 应仍可访问
      const resB = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '5.6.7.8'
        },
        body: JSON.stringify({ username: 'userb1', password: 'TestPass99!' })
      })
      expect(resB.status).toBe(201)
    })
  })

  describe('Password Policy (on register)', () => {
    it('should reject password shorter than 8 chars', async () => {
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'weakuser1', password: 'Ab1!' })
      })
      expect(res.status).toBe(400)
    })

    it('should reject common weak password "password123"', async () => {
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'weakuser2', password: 'password123' })
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('Weak password')
    })

    it('should reject password without numbers', async () => {
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'weakuser3', password: 'abcdefgh' })
      })
      expect(res.status).toBe(400)
    })

    it('should reject password with 4+ repeated characters', async () => {
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'weakuser4', password: 'Pass1111word' })
      })
      expect(res.status).toBe(400)
    })

    it('should reject password with sequential chars "abcd1234"', async () => {
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'weakuser5', password: 'abcd1234' })
      })
      expect(res.status).toBe(400)
    })

    it('should accept strong password', async () => {
      const res = await server.getApp().request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'stronguser', password: 'MyStr0ng!Pass2024' })
      })
      expect(res.status).toBe(201)
    })
  })
})
