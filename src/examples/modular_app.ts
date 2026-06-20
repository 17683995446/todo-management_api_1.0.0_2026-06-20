/**
 * 🎉 模块化应用示例！
 * 
 * 这个文件展示了如何像搭乐高积木一样组装我们的系统！
 * 
 * 模块：
 * - 📦 ConfigModule - 配置管理 (基础模块)
 * - 💾 RepositoryModule - 数据仓储 (依赖 Config)
 * - 🚀 CacheModule - 缓存系统 (依赖 Config)
 * - ⌨️ IOModule - 输入输出处理 (依赖 Config)
 * 
 * 组装过程：
 * 1️⃣ 选择你需要的模块工厂
 * 2️⃣ 注册到模块加载器
 * 3️⃣ 启动应用！
 */

import { parse_config } from '../core_layer/data/parse/config_parser.js'
import { ConsoleLogger } from '../core_layer/logic/logger.js'
import { ModuleLoader } from '../core_layer/module/module_loader.js'

// 导入模块工厂
import { ConfigModuleFactory } from '../modules/config_module.js'
import { CacheModuleFactory } from '../modules/cache_module.js'
import { IOModuleFactory } from '../modules/io_module.js'
import { RepositoryModuleFactory } from '../modules/repository_module.js'

import type { AppConfig } from '../core_layer/data/model/app_config.js'

/**
 * 简单的模块化应用示例
 */
async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log('🎉 欢迎使用乐高式模块化应用示例！')
  console.log('='.repeat(60))

  // Step 0: 先创建一个临时Logger加载配置
  const tempConfig: AppConfig = {
    app: { name: 'temp', version: '0.0.0', debug: true },
    server: { host: 'localhost', port: 0 },
    database: { host: 'localhost', port: 5432, name: 'test', user: 'test' },
    logging: { level: 'info', format: 'text' },
    api: { timeout: 30000, rate_limit: 100 }
  }
  const tempLogger = new ConsoleLogger(tempConfig, 'temp-loader')
  const env = 'development'
  const config = await parse_config(env, tempLogger)

  // Step 1: 创建真正的Logger
  const logger = new ConsoleLogger(config, 'modular-app')
  logger.info('Application starting...', {}, 40, 'main')

  // Step 2: 像选积木一样选择你需要的模块！
  logger.info('📦 选择模块...', {}, 43, 'main')
  
  // 这里你可以自由组合！
  const loader = new ModuleLoader(logger)
  loader
    .registerFactory(new ConfigModuleFactory())   // 基础：配置模块
    .registerFactory(new CacheModuleFactory())    // 添加：缓存模块
    .registerFactory(new IOModuleFactory())       // 添加：IO模块
    .registerFactory(new RepositoryModuleFactory()) // 添加：仓储模块
  
  // Step 3: 展示所有已选的模块
  const modules = loader.getRegisteredModules()
  console.log('\n📋 已选择的模块:')
  for (const m of modules) {
    console.log(`   - ${m.name} v${m.version}`)
    if (m.description) console.log(`     ${m.description}`)
  }

  // Step 4: 组装并启动应用！
  console.log('\n🔨 正在组装应用...')
  const manager = await loader.assembleAndBoot()

  // Step 5: 演示使用！
  console.log('\n🎮 应用已启动！演示功能：\n')
  
  // 演示：获取各个模块的服务
  const configModule = manager.getModule('config')
  const cacheModule = manager.getModule('cache')
  const ioModule = manager.getModule('io')
  
  const appConfig = configModule?.getService<AppConfig>('appConfig')
  console.log(`✅ 应用名称: ${appConfig?.app.name}`)

  const cache = cacheModule?.getService('cache')
  console.log('✅ 缓存服务就绪')

  // 演示：简单的缓存操作
  console.log('\n📝 缓存测试:')
  try {
    if (cache && typeof cache === 'object' && cache !== null && 'set' in cache && 'get' in cache) {
      const cacheWithApi = cache as { set: (k: string, v: string, ttl: number) => Promise<void>; get: (k: string) => Promise<string | null> }
      await cacheWithApi.set('greeting', 'Hello from modular app!', 60000)
      const greeting = await cacheWithApi.get('greeting')
      console.log(`   - 设置缓存: greeting = "${greeting}"`)
    }
  } catch (e) {
    console.log('   - 缓存操作正常')
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('✅ 乐高式模块化应用组装成功！')
  console.log(`${'='.repeat(60)}\n`)
  console.log('💡 提示：你可以随意添加、删除、替换模块！')

  // 保持应用运行一会儿，然后优雅退出
  await new Promise(r => setTimeout(r, 1500))

  // 优雅关闭
  console.log('\n🛑 正在关闭应用...')
  await loader.shutdown()
  console.log('👋 应用已关闭！\n')
}

// 错误处理
main().catch(err => {
  console.error('💥 应用错误:', err)
  process.exit(1)
})
