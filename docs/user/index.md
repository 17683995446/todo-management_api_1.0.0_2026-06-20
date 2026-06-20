# 用户指南

## 快速开始

### 1. 安装

```bash
cd project
npm install
```

### 2. 启动 HTTP 服务器

```bash
npm run dev
```

服务器启动在 `http://127.0.0.1:8080`，内置演示用户 `demo` / `DemoPass99!`。

### 3. 使用 CLI 管理 Todo

```bash
npm run cli list                          # 列出所有待办
npm run cli add --title "完成任务"         # 添加待办
npm run cli complete --id <todo-id>       # 完成待办
npm run cli stats                         # 查看统计
npm run cli users                         # 列出用户
```

### 4. 体验 Agent 自驱循环

```bash
npm run demo              # 列出所有演示
npm run demo -- ooda      # OODA 循环演示
npm run demo -- all       # 运行所有演示
```

## 配置

系统通过 `config/<NODE_ENV>.yaml` 加载配置，默认 `NODE_ENV=development`。

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `NODE_ENV` | 运行环境 | development |
| `DB_PATH` | SQLite 数据库路径 | data/todos.db |

参考 `.env.example` 了解可用的环境变量。

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 编译 TypeScript |
| `npm start` | 启动生产服务器 |
| `npm test` | 运行测试 |
| `npm run typecheck` | 类型检查 |
| `npm run lint` | 代码检查 |
| `npm run format` | 代码格式化 |

## 部署

详见 [部署指南](../deploy/index.md) 和 [DEPLOY.md](../../DEPLOY.md)。
