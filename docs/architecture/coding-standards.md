# 编码规范（Coding Standards）

## 1. 文件结构规范

### 目录结构
- 严格遵循满二叉树结构，所有非叶子目录最多 2 个子节点
- 顶层目录固定为：`src`、`tests`、`config`、`docs`、`scripts`、`assets`

### 命名规范
- 文件名：小写加下划线（snake_case），例如 `my_module.ts`
- 类名：大驼峰（PascalCase），例如 `MyClass`
- 函数/方法：小驼峰（camelCase），例如 `myFunction`
- 常量：全大写下划线（UPPER_SNAKE_CASE），例如 `MAX_COUNT`
- 私有属性/方法：前缀下划线，例如 `_privateProperty`

### 文件组织
- 一个文件只定义一个主类/接口
- 接口定义放在单独文件中，后缀为 `.interface.ts`
- 枚举定义放在单独文件中，后缀为 `.enum.ts`

---

## 2. TypeScript 规范

### 类型注解
- **必须**为所有函数参数和返回值添加类型注解
- 避免使用 `any`，使用 `unknown` 代替
- 使用严格模式（strict: true）

### 接口与抽象类
- **优先使用 `interface` 定义契约**
- 抽象类用于实现共享逻辑
- 所有主要模块必须有对应的接口

### 错误处理
- 使用自定义错误类，继承自 `Error`
- **必须**处理 Promise 拒绝
- 使用 Result 模式替代异常流（可选）

---

## 3. 注释规范

### JSDoc 要求
- **所有公共类、方法、属性必须有 JSDoc**
- JSDoc 必须包含：`@description`、`@param`、`@returns`、`@throws`（如有）
- 示例：
```typescript
/**
 * 获取用户信息
 * @param userId - 用户唯一标识
 * @returns 用户信息对象，未找到返回 null
 * @throws {NotFoundError} - 当用户不存在时
 */
async function getUser(userId: string): Promise<User | null> {
  // 实现
}
```

---

## 4. 测试规范

### 测试文件
- 每个源文件对应一个测试文件，命名为 `{module}.test.ts`
- 测试文件放在与源文件相同的相对路径下

### 测试覆盖
- **必须覆盖**正常值、空值、边界值、非法值四种情况
- 目标测试覆盖率 ≥ 95%

---

## 5. Git 提交规范

### 提交信息格式
```
<type>(<scope>): <subject>

<body>
```

### Type 类型
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档变更
- `style`: 格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关
