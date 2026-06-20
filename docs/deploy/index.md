# 部署指南

## 概述

本项目支持本地开发和 Docker 部署。详见 [DEPLOY.md](../../DEPLOY.md) 获取完整部署说明。

## Docker 部署

### 构建镜像

```bash
docker build -t claude-code-binary-tree .
```

### 运行容器

```bash
docker run -d \
  --name ccb-app \
  -p 8080:80 \
  -e NODE_ENV=docker \
  -e DB_PATH=/app/data/todos.db \
  -v ccb-data:/app/data \
  claude-code-binary-tree
```

### Docker Compose

```bash
docker-compose up -d
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境（development / test / prod / docker） | development |
| `DB_PATH` | SQLite 数据库文件路径 | data/todos.db |

对应的配置文件位于 `config/<NODE_ENV>.yaml`。

## 本地生产部署

```bash
npm install
npm run build
NODE_ENV=prod npm start
```

## 持续运行

使用 PM2 管理进程：

```bash
pm2 start dist/server.js --name ccb-app
pm2 save
pm2 startup
```

详见 [RUN_6H_GUIDE.md](../../RUN_6H_GUIDE.md)。
