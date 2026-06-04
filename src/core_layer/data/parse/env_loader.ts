export function get_env_var(key: string, defaultValue?: string): string {
  const value = process.env[key]
  if (value !== undefined) {
    return value
  }
  if (defaultValue !== undefined) {
    return defaultValue
  }
  throw new Error(`Environment variable ${key} is not set`)
}

export function get_env(): string {
  return get_env_var('NODE_ENV', 'development')
}
