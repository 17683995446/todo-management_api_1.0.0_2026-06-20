# 架构说明

## 概述

本项目是一个基于 OODA 循环（Observe → Decide → Act → Reflect）的自驱 Agent 框架，采用分层架构组织代码。

## 目录结构

```
project/
├── src/
│   ├── core_layer/          # 核心基础设施层
│   │   ├── data/            # 数据层
│   │   │   ├── access/      # 数据访问（SQLite 仓储、迁移）
│   │   │   ├── model/       # 数据模型（AppConfig、Todo、User）
│   │   │   └── parse/       # 配置解析（YAML、环境变量）
│   │   ├── logic/           # 业务逻辑
│   │   │   ├── logger.ts            # 控制台日志器
│   │   │   ├── in_memory_cache.ts   # 内存缓存
│   │   │   ├── rate_limiter.ts      # 滑动窗口限流
│   │   │   ├── auth_service.ts      # 认证服务
│   │   │   └── shutdown_manager.ts  # 优雅关闭
│   │   ├── module/          # 模块系统（BaseModule、ModuleManager）
│   │   ├── model/           # 领域模型与错误体系（AppError、ErrorCode）
│   │   └── telemetry/       # OpenTelemetry 遥测
│   ├── agent_layer/         # Agent 自驱循环层
│   │   ├── core/            # OODA 核心组件
│   │   │   ├── agent_loop.ts        # 基础循环
│   │   │   ├── observer.ts          # 观察器
│   │   │   ├── decision_engine.ts   # 决策引擎
│   │   │   ├── actor.ts             # 行动器
│   │   │   ├── reflector.ts         # 反思器
│   │   │   ├── goal_queue.ts        # 目标队列
│   │   │   └── scheduler.ts         # 调度器
│   │   ├── enhancement/     # 增强组件
│   │   │   ├── enhanced_agent_loop.ts  # 增强循环
│   │   │   ├── skill_registry.ts       # 技能注册表
│   │   │   ├── orchestrator.ts         # 多 Agent 编排
│   │   │   ├── task_planner.ts         # 长任务规划
│   │   │   ├── learning_engine.ts      # 学习引擎
│   │   │   └── watchdog.ts             # 看门狗
│   │   ├── governance/      # 治理组件
│   │   │   ├── ordered_agent_loop.ts   # 秩序化循环
│   │   │   ├── policy_engine.ts        # 策略引擎
│   │   │   ├── audit_trail.ts          # 审计日志
│   │   │   ├── resource_budget.ts      # 资源预算
│   │   │   ├── lifecycle_manager.ts    # 生命周期管理
│   │   │   └── metrics_collector.ts    # 指标采集
│   │   ├── model/           # Agent 领域模型
│   │   ├── agent.interface.ts  # 接口契约
│   │   └── index.ts         # Barrel file
│   ├── modules/             # 可插拔模块
│   │   ├── agent_module.ts          # Agent 模块
│   │   ├── config_module.ts         # 配置模块
│   │   ├── cache_module.ts          # 缓存模块
│   │   ├── io_module.ts             # IO 模块
│   │   └── repository_module.ts     # 仓储模块
│   ├── presentation_layer/  # 表现层
│   │   ├── api/             # HTTP API（Hono）
│   │   └── cli/             # CLI（输入/输出）
│   ├── server.ts            # HTTP 服务器入口
│   ├── cli.ts               # CLI 入口
│   └── index.ts             # 顶层 Barrel file
├── config/                  # 环境配置文件（YAML）
├── tests/                   # 测试套件（Vitest）
└── docs/                    # 文档
```

## 分层设计

### core_layer（核心基础设施）
提供日志、缓存、仓储、配置、模块系统等基础能力。所有组件不依赖 Agent 层。

### agent_layer（Agent 自驱循环）
实现 OODA 循环及增强/治理能力。依赖 core_layer 的基础设施。

### modules（可插拔模块）
将 Agent 层组件整合为可插拔模块，通过模块系统管理生命周期。

### presentation_layer（表现层）
提供 HTTP API 和 CLI 两种用户交互方式。

## 设计原则

- **依赖方向**：上层依赖下层，下层不依赖上层
- **接口契约**：每层通过 `.interface.ts` 文件定义公共接口
- **Barrel 导出**：每层通过 `index.ts` 统一导出公共 API
- **错误体系**：统一的 `AppError` 基类 + `ErrorCode` 枚举 + 具体错误类
- **模块化**：组件通过模块系统管理生命周期（initialize → start → stop）
