import { describe, it, expect, beforeEach } from 'vitest'
import { ConsoleLogger } from '../../../src/core_layer/logic/logger.js'
import { AuthService } from '../../../src/core_layer/logic/auth_service.js'
import { InMemoryRepository } from '../../../src/core_layer/data/access/in_memory_repository.js'
import { createAuthRoutes } from '../../../src/presentation_layer/api/features/routes/auth_routes.js'
import type { AppConfig } from '../../../src/core_layer/data/model/app_config.js'
import type { User } from '../../../src/core_layer/model/user.js'

describe('AuthService', () => {
  let logger: ConsoleLogger
  let authService: AuthService

  beforeEach(() => {
    const config: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: false },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(config, 'auth-test')
    authService = new AuthService(logger, 'test-secret-key')
  })

  it('should hash and verify password correctly', () => {
    const password = 'mySecretPassword123'
    const hash = authService.hashPassword(password)
    expect(hash).not.toBe(password)
    expect(hash).toContain(':')
    expect(authService.verifyPassword(password, hash)).toBe(true)
  })

  it('should reject wrong password', () => {
    const hash = authService.hashPassword('correctPassword')
    expect(authService.verifyPassword('wrongPassword', hash)).toBe(false)
  })

  it('should generate different hashes for same password (salt)', () => {
    const hash1 = authService.hashPassword('samePassword')
    const hash2 = authService.hashPassword('samePassword')
    expect(hash1).not.toBe(hash2)
    expect(authService.verifyPassword('samePassword', hash1)).toBe(true)
    expect(authService.verifyPassword('samePassword', hash2)).toBe(true)
  })

  it('should generate and verify valid JWT token', () => {
    const payload = { userId: 'user-123', username: 'testuser' }
    const token = authService.generateToken(payload)
    expect(token.split('.').length).toBe(3)

    const verified = authService.verifyToken(token)
    expect(verified).not.toBeNull()
    expect(verified?.userId).toBe('user-123')
    expect(verified?.username).toBe('testuser')
  })

  it('should reject tampered token', () => {
    const token = authService.generateToken({ userId: 'user-123', username: 'testuser' })
    const tampered = `${token.slice(0, -5)}XXXXX`
    expect(authService.verifyToken(tampered)).toBeNull()
  })

  it('should reject malformed token', () => {
    expect(authService.verifyToken('not.a.valid')).toBeNull()
    expect(authService.verifyToken('invalid')).toBeNull()
    expect(authService.verifyToken('')).toBeNull()
  })
})

describe('Auth Routes', () => {
  let logger: ConsoleLogger
  let userRepo: InMemoryRepository<User>
  let authService: AuthService
  let app: ReturnType<typeof createAuthRoutes>

  beforeEach(() => {
    const config: AppConfig = {
      app: { name: 'test', version: '1.0.0', debug: false },
      server: { host: '127.0.0.1', port: 0 },
      database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
      logging: { level: 'error', format: 'text' },
      api: { timeout: 30000, rate_limit: 100 }
    }
    logger = new ConsoleLogger(config, 'auth-routes-test')
    userRepo = new InMemoryRepository<User>(logger)
    authService = new AuthService(logger, 'test-secret')
    app = createAuthRoutes(logger, userRepo, authService)
  })

  it('should register a new user', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.token).toBeDefined()
    expect(body.data.user.username).toBe('testuser')
  })

  it('should reject duplicate username', async () => {
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'password456' })
    })
    expect(res.status).toBe(409)
  })

  it('should login with correct credentials', async () => {
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.token).toBeDefined()
  })

  it('should reject login with wrong password', async () => {
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'wrongpassword' })
    })
    expect(res.status).toBe(401)
  })

  it('should reject login with non-existent user', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'noexist', password: 'TestPass99!' })
    })
    expect(res.status).toBe(401)
  })

  it('should reject short username', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ab', password: 'TestPass99!' })
    })
    expect(res.status).toBe(400)
  })

  it('should reject short password', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: '12345' })
    })
    expect(res.status).toBe(400)
  })

  it('should reject non-alphanumeric username', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test user!', password: 'TestPass99!' })
    })
    expect(res.status).toBe(400)
  })

  it('should use username as displayName if not provided', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!' })
    })
    const body = await res.json()
    expect(body.data.user.displayName).toBe('testuser')
  })

  it('should accept custom displayName', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'TestPass99!', displayName: 'Test User' })
    })
    const body = await res.json()
    expect(body.data.user.displayName).toBe('Test User')
  })
})
