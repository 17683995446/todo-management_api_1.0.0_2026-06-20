/**
 * 密码策略
 * 定义密码强度校验规则，用于注册/修改密码时强制最小安全要求。
 */

export interface PasswordPolicyResult {
  valid: boolean
  errors: string[]
  /** 强度评分：0-4，对应 弱/中/较强/强/非常强 */
  score: number
}

/**
 * 常见弱密码黑名单（小写比较）
 * 这些密码即使满足长度/复杂度要求也应拒绝
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123',
  '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop',
  'abc12345', 'abcdefgh',
  'iloveyou', 'letmein', 'welcome1',
  'admin123', 'root123', 'passw0rd',
  '11111111', '00000000', '88888888',
  'sunshine', 'football', 'baseball',
  'dragon123', 'monkey123'
])

/**
 * 校验密码是否符合安全策略
 *
 * 规则：
 * - 长度 8-128
 * - 至少包含一个字母和一个数字
 * - 不允许纯字母或纯数字
 * - 不在常见弱密码黑名单中
 * - 不允许包含连续重复字符（如 aaaa, 1111）
 *
 * 强度评分（0-4）：
 * - 0: 不合规
 * - 1: 弱（仅满足最小要求）
 * - 2: 中（包含字母+数字+8位以上）
 * - 3: 较强（包含大小写+数字+10位以上）
 * - 4: 强（包含大小写+数字+特殊字符+12位以上）
 *
 * @param password - 待校验的密码
 */
export function validatePassword(password: string): PasswordPolicyResult {
  const errors: string[] = []

  if (typeof password !== 'string') {
    return { valid: false, errors: ['Password must be a string'], score: 0 }
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long')
  }
  if (password.length > 128) {
    errors.push('Password must be at most 128 characters long')
  }

  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  if (!hasLetter) {
    errors.push('Password must contain at least one letter')
  }
  if (!hasNumber) {
    errors.push('Password must contain at least one number')
  }

  // 常见弱密码黑名单
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common, please choose a stronger one')
  }

  // 连续重复字符（4 个或以上相同字符）
  if (/(.)\1{3,}/.test(password)) {
    errors.push('Password must not contain 4 or more repeated characters')
  }

  // 顺序字符（如 abcd, 1234, qwerty）
  if (hasSequentialChars(password, 4)) {
    errors.push('Password must not contain sequential characters (e.g. abcd, 1234)')
  }

  if (errors.length > 0) {
    return { valid: false, errors, score: 0 }
  }

  // 计算强度评分
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)
  const length = password.length

  let score = 1 // 已满足最小要求
  if (hasLower && hasUpper && length >= 10) score = 3
  else if (hasLetter && hasNumber && length >= 8) score = 2

  if (score >= 3 && hasSpecial && length >= 12) score = 4

  return { valid: true, errors: [], score }
}

/**
 * 检测是否包含 N 个或以上的连续字符（顺序或逆序）
 * 例如：abcd, 1234, dcba, 4321, qwerty
 */
function hasSequentialChars(password: string, minLen: number): boolean {
  if (password.length < minLen) return false

  // 常见键盘顺序
  const keyboardSequences = [
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    '1234567890', 'abcdefghijklmnopqrstuvwxyz'
  ]

  const lower = password.toLowerCase()

  for (const seq of keyboardSequences) {
    // 正向
    for (let i = 0; i <= seq.length - minLen; i++) {
      const sub = seq.slice(i, i + minLen)
      if (lower.includes(sub)) return true
    }
    // 逆向
    const reversed = seq.split('').reverse().join('')
    for (let i = 0; i <= reversed.length - minLen; i++) {
      const sub = reversed.slice(i, i + minLen)
      if (lower.includes(sub)) return true
    }
  }

  return false
}
