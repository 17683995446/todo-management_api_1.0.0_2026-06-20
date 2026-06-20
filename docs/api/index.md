# API 文档

## 概述

HTTP API 基于 Hono 框架，提供 Todo 管理和认证功能。所有 `/api/todos` 端点需要认证。

基础地址：`http://127.0.0.1:8080`

## 认证

### POST /api/auth/register
注册新用户。

**请求体：**
```json
{
  "username": "newuser",
  "password": "Password123!"
}
```

### POST /api/auth/login
登录获取 Token。

**请求体：**
```json
{
  "username": "demo",
  "password": "DemoPass99!"
}
```

**响应：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Todo 管理

所有 Todo 端点需要在请求头携带 `Authorization: Bearer <token>`。

### GET /api/todos
获取当前用户的 Todo 列表。

**查询参数：**
- `status` — 过滤状态（pending / completed）
- `priority` — 过滤优先级（low / medium / high / urgent）

### POST /api/todos
创建 Todo。

**请求体：**
```json
{
  "title": "完成项目文档",
  "priority": "high",
  "dueDate": "2026-01-15",
  "tags": ["docs", "urgent"]
}
```

### PUT /api/todos/:id
更新 Todo。

**请求体：**
```json
{
  "title": "更新后的标题",
  "status": "completed"
}
```

### DELETE /api/todos/:id
删除 Todo。

## 其他端点

### GET /
内置 Web 界面（HTML）。

### GET /health
健康检查（检查 DB 连通性、返回版本与内存指标）。

**响应：**
```json
{
  "success": true,
  "status": "ok",
  "timestamp": "2026-06-20T12:00:00.000Z",
  "uptimeSeconds": 3600,
  "version": "1.0.0",
  "dbConnected": true,
  "memoryUsage": {
    "rssBytes": 52428800,
    "heapUsedBytes": 10485760,
    "heapTotalBytes": 20971520
  }
}
```

| 字段 | 说明 |
|------|------|
| `status` | `ok`（DB 正常）/ `degraded`（DB 不可用但服务在运行） |
| `dbConnected` | 数据库连通性 |
| `version` | 应用版本号 |
| `memoryUsage` | Node.js 进程内存使用（RSS / 堆已用 / 堆总量） |

### GET /api/stats/cache
缓存统计信息。

### DELETE /api/stats/cache
清空缓存。

## 错误响应

所有错误返回统一格式：

```json
{
  "success": false,
  "error": "错误描述",
  "code": "NOT_FOUND",
  "details": {}
}
```

| 字段 | 说明 |
|------|------|
| `success` | 固定为 `false` |
| `error` | 人类可读的错误描述 |
| `code` | 机器可读的错误码（见下表），便于客户端程序化处理 |
| `details` | 额外调试信息（如字段级验证错误、上下文） |

### 错误码与 HTTP 状态码映射

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `INVALID_INPUT` | 400 | 请求参数无效 |
| `UNSUPPORTED_OPERATION` | 400 | 操作不支持 |
| `UNAUTHORIZED` | 401 | 未认证 |
| `FORBIDDEN` | 403 | 无权限 |
| `POLICY_VIOLATION` | 403 | 策略违规 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `ALREADY_EXISTS` | 409 | 资源已存在 |
| `INVALID_STATE_TRANSITION` | 409 | 状态转换非法 |
| `BUDGET_EXCEEDED` | 429 | 资源预算耗尽 |
| `CIRCUIT_BREAKER_OPEN` | 503 | 熔断器打开 |
| `CONFIG_LOAD_FAILED` | 500 | 配置加载失败 |
| `CONFIG_PARSE_FAILED` | 500 | 配置解析失败 |
| `CONFIG_VALIDATION_FAILED` | 500 | 配置验证失败 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
