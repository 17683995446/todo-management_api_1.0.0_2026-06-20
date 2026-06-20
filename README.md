# Claude Code Binary Tree

一个基于 **OODA 循环**（Observe → Decide → Act → Reflect）的自驱 Agent 框架，采用满二叉树分层架构。

Agent 能自主观察系统状态、做出决策、执行行动、从结果中反思学习，并通过治理组件（策略/审计/预算/生命周期/指标）确保安全合规运行。

## 特性

- **OODA 自驱循环**：Agent 自主运行观察-决策-行动-反思闭环
- **治理体系**：策略引擎、审计日志、资源预算、生命周期管理、指标采集
- **增强能力**：技能系统、多 Agent 编排、长任务规划、学习引擎、看门狗
- **模块化**：可插拔模块系统，按需启用治理/增强组件
- **生产就绪**：SQLite 持久化、Hono HTTP API、OpenTelemetry 遥测、Docker 部署

## 快速开始

### 环境要求

- Node.js >= 20
- npm

### 安装

```bash
cd project
npm install
```

### 运行 HTTP 服务器

```bash
npm run dev
```

服务器启动在 `http://127.0.0.1:8080`，内置演示用户：

| 用户名 | 密码 |
|--------|------|
| demo | DemoPass99! |

访问 `http://127.0.0.1:8080/` 可使用内置 Web 界面。

### 使用 CLI 管理 Todo

```bash
# 列出所有待办
npm run cli list

# 添加待办
npm run cli add --title "完成项目文档"

# 完成待办
npm run cli complete --id <todo-id>

# 查看统计
npm run cli stats
```

### 体验 Agent 自驱循环

```bash
# 列出所有可用演示
npm run demo

# 运行指定演示
npm run demo -- ooda        # 基础 OODA 循环演示
npm run demo -- enhanced    # 增强能力演示（技能/编排/任务/学习/看门狗）
npm run demo -- governance  # 治理体系演示（策略/审计/预算/生命周期/指标）
npm run demo -- modular     # 模块化组装示例

# 依次运行所有演示
npm run demo -- all
```

## 项目结构

```
project/
├── src/
│   ├── core_layer/          # 核心基础设施
│   │   ├── data/            # 数据层（仓储、配置解析、迁移）
│   │   ├── logic/           # 业务逻辑（日志、缓存、认证、限流）
│   │   ├── module/          # 模块系统（BaseModule/IModule）
│   │   ├── model/           # 领域模型与错误体系
│   │   └── telemetry/       # OpenTelemetry 遥测
│   ├── agent_layer/         # Agent 自驱循环
│   │   ├── core/            # OODA 核心组件
│   │   ├── enhancement/     # 增强组件（技能/编排/学习）
│   │   ├── governance/      # 治理组件（策略/审计/预算）
│   │   └── model/           # Agent 领域模型
│   ├── modules/             # 可插拔模块（Agent/Config/Cache/IO/Repository）
│   ├── presentation_layer/  # 表现层（HTTP API、CLI）
│   ├── server.ts            # HTTP 服务器入口
│   └── cli.ts               # CLI 入口
├── config/                  # 环境配置文件（YAML）
├── tests/                   # 测试套件（Vitest）
└── docs/                    # 文档
```

## 配置

系统通过 `config/<NODE_ENV>.yaml` 加载配置，默认 `NODE_ENV=development`。

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `NODE_ENV` | 运行环境（development/test/prod/docker） | development |
| `DB_PATH` | SQLite 数据库路径 | data/todos.db |

配置文件示例见 `config/development.yaml`。

## 开发

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 运行测试
npm test

# 构建生产版本
npm run build

# 启动生产服务器
npm start
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript（ESM） |
| 运行时 | Node.js >= 20 |
| HTTP 框架 | Hono |
| 数据库 | SQLite（better-sqlite3） |
| 校验 | Zod |
| 遥测 | OpenTelemetry |
| 测试 | Vitest |
| 代码规范 | Biome |

## 部署

详见 [DEPLOY.md](./DEPLOY.md)。

## 许可证

MIT
