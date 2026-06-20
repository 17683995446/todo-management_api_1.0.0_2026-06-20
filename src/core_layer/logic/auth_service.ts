import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'
import type { Logger } from './logger.js'

/**
 * 认证服务
 * 负责密码哈希、验证和 JWT 令牌生成/校验
 */
export class AuthService {
  private readonly logger: Logger
  private readonly secret: string

  constructor(logger: Logger, secret?: string) {
    this.logger = logger
    this.secret = secret || process.env.JWT_SECRET || randomBytes(32).toString('hex')
    this.logger.trace('AuthService initialized', {}, 14, 'constructor')
  }

  /**
   * 使用 scrypt 哈希密码
   */
  hashPassword(password: string): string {
    this.logger.trace('hashPassword called', {}, 21, 'hashPassword')
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
  }

  /**
   * 验证密码
   */
  verifyPassword(password: string, stored: string): boolean {
    this.logger.trace('verifyPassword called', {}, 31, 'verifyPassword')
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) {
      this.logger.trace('verifyPassword: invalid stored format', {}, 34, 'verifyPassword')
      return false
    }
    const testHash = scryptSync(password, salt, 64)
    const storedHash = Buffer.from(hash, 'hex')
    if (testHash.length !== storedHash.length) {
      return false
    }
    return timingSafeEqual(testHash, storedHash)
  }

  /**
   * 生成 JWT 令牌
   */
  generateToken(payload: { userId: string; username: string }): string {
    this.logger.trace('generateToken called', { userId: payload.userId }, 47, 'generateToken')
    const header = { alg: 'HS256', typ: 'JWT' }
    const now = Math.floor(Date.now() / 1000)
    const body = { ...payload, iat: now, exp: now + 7 * 24 * 3600 }
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
    const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url')
    const signature = createHmac('sha256', this.secret).update(`${encodedHeader}.${encodedBody}`).digest('base64url')
    return `${encodedHeader}.${encodedBody}.${signature}`
  }

  /**
   * 验证 JWT 令牌
   * @returns 解码后的 payload，或 null 表示无效
   */
  verifyToken(token: string): { userId: string; username: string } | null {
    this.logger.trace('verifyToken called', {}, 61, 'verifyToken')
    const parts = token.split('.')
    if (parts.length !== 3) {
      this.logger.trace('verifyToken: invalid format', {}, 64, 'verifyToken')
      return null
    }
    const [encodedHeader, encodedBody, signature] = parts
    const expectedSignature = createHmac('sha256', this.secret).update(`${encodedHeader}.${encodedBody}`).digest('base64url')

    const sigBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expectedSignature)
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      this.logger.trace('verifyToken: signature mismatch', {}, 72, 'verifyToken')
      return null
    }

    try {
      const body = JSON.parse(Buffer.from(encodedBody, 'base64url').toString()) as { userId: string; username: string; exp: number }
      if (body.exp < Math.floor(Date.now() / 1000)) {
        this.logger.trace('verifyToken: token expired', {}, 78, 'verifyToken')
        return null
      }
      return { userId: body.userId, username: body.username }
    } catch {
      this.logger.trace('verifyToken: invalid payload', {}, 82, 'verifyToken')
      return null
    }
  }
}
