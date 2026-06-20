# 🚀 部署指南

## 快速开始

### 1. 本地开发
```bash
# 安装依赖
npm ci

# 启动开发服务器
npm run dev
```

### 2. 构建生产版本
```bash
# 构建项目
npm run build

# 启动生产服务器
npm start
```

### 3. 使用 Docker 部署
```bash
# 构建镜像
cd /workspace/project
docker build -t ccb-app -f scripts/project/Dockerfile .

# 运行容器
docker run -d -p 80:80 --name ccb-app ccb-app
```

### 4. 使用 Docker Compose 部署完整栈
```bash
cd /workspace/project

# 生产环境（包含 PostgreSQL + Redis）
docker compose -f scripts/project/docker-compose.yml up -d

# 本地开发环境（源码热挂载，端口 8080）
docker compose -f scripts/project/docker-compose.dev.yml up -d
```

## API 端点

- `GET /health` - 健康检查
- `GET /api/todos` - 获取所有待办事项
- `POST /api/todos` - 创建待办事项
- `PUT /api/todos/:id` - 更新待办事项
- `DELETE /api/todos/:id` - 删除待办事项

## 配置

配置文件位于 `config/` 目录：
- `development.yaml` / `dev.yaml` - 本地开发
- `docker.yaml` - Docker 容器环境
- `prod.yaml` - 生产环境
