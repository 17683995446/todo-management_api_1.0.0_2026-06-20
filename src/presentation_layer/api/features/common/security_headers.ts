import type { MiddlewareHandler } from 'hono'

/**
 * 安全响应头配置
 */
export interface SecurityHeadersOptions {
  /** 是否启用 HSTS（仅在生产 HTTPS 环境下启用） */
  enableHsts?: boolean
  /** HSTS 最大有效期（秒），默认 1 年 */
  hstsMaxAge?: number
  /** HSTS 是否包含子域名 */
  hstsIncludeSubdomains?: boolean
  /** Content-Security-Policy 策略，默认允许同源 + 内联样式/脚本 */
  contentSecurityPolicy?: string
  /** 是否隐藏 X-Powered-By */
  hidePoweredBy?: boolean
}

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ')

/**
 * 安全响应头中间件
 * 添加一组标准的安全相关 HTTP 头，降低常见 Web 攻击面：
 * - X-Content-Type-Options: nosniff  防止 MIME 嗅探
 * - X-Frame-Options: DENY            防止点击劫持
 * - Referrer-Policy                  控制 Referer 泄露
 * - X-XSS-Protection                 旧版浏览器 XSS 过滤器
 * - Strict-Transport-Security        强制 HTTPS（仅启用时）
 * - Content-Security-Policy          内容安全策略
 *
 * @param options - 安全头配置
 */
export function createSecurityHeadersMiddleware(options: SecurityHeadersOptions = {}): MiddlewareHandler {
  const {
    enableHsts = false,
    hstsMaxAge = 31536000,
    hstsIncludeSubdomains = true,
    contentSecurityPolicy = DEFAULT_CSP,
    hidePoweredBy = true
  } = options

  const hstsValue = enableHsts
    ? `max-age=${hstsMaxAge}${hstsIncludeSubdomains ? '; includeSubDomains' : ''}`
    : ''

  return async (c, next) => {
    // 先执行下游中间件/路由，再设置响应头，确保覆盖下游可能设置的同名头
    await next()

    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('X-XSS-Protection', '1; mode=block')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('Cross-Origin-Resource-Policy', 'same-origin')
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

    if (contentSecurityPolicy) {
      c.header('Content-Security-Policy', contentSecurityPolicy)
    }

    if (hstsValue) {
      c.header('Strict-Transport-Security', hstsValue)
    }

    if (hidePoweredBy) {
      c.header('X-Powered-By', '')
    }
  }
}
