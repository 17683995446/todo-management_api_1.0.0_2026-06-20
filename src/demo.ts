#!/usr/bin/env node
/**
 * 统一 Demo 入口
 *
 * 列出所有可用演示，用户可通过参数选择运行：
 *   npm run demo              # 列出所有演示
 *   npm run demo -- ooda      # 运行 OODA 循环演示
 *   npm run demo -- enhanced  # 运行增强能力演示
 *   npm run demo -- governance # 运行治理体系演示
 *   npm run demo -- modular   # 运行模块化组装示例
 *   npm run demo -- all       # 依次运行所有演示
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface DemoEntry {
  name: string
  description: string
  script: string
}

const demos: DemoEntry[] = [
  {
    name: 'ooda',
    description: '基础 OODA 循环演示（Observe → Decide → Act → Reflect 自驱闭环）',
    script: resolve(__dirname, 'agent_layer/demo.ts'),
  },
  {
    name: 'enhanced',
    description: '增强能力演示（技能/编排/任务/学习/看门狗）',
    script: resolve(__dirname, 'agent_layer/enhanced_demo.ts'),
  },
  {
    name: 'governance',
    description: '治理体系演示（策略/审计/预算/生命周期/指标）',
    script: resolve(__dirname, 'agent_layer/governance_demo.ts'),
  },
  {
    name: 'modular',
    description: '模块化组装示例（Config/Cache/IO/Repository 模块）',
    script: resolve(__dirname, 'examples/modular_app.ts'),
  },
]

function printHelp(): void {
  console.log('\n可用演示:\n')
  for (const demo of demos) {
    console.log(`  ${demo.name.padEnd(12)} ${demo.description}`)
  }
  console.log('\n用法:')
  console.log('  npm run demo -- <name>    运行指定演示')
  console.log('  npm run demo -- all       依次运行所有演示')
  console.log('')
}

function runDemo(script: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', script], {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    child.on('close', (code) => resolve(code ?? 0))
    child.on('error', reject)
  })
}

async function main(): Promise<void> {
  const arg = process.argv[2]

  if (!arg || arg === '--help' || arg === '-h') {
    printHelp()
    return
  }

  if (arg === 'all') {
    for (const demo of demos) {
      console.log(`\n${'═'.repeat(70)}`)
      console.log(`  运行演示: ${demo.name} — ${demo.description}`)
      console.log(`${'═'.repeat(70)}\n`)
      const code = await runDemo(demo.script)
      if (code !== 0) {
        console.error(`演示 ${demo.name} 以退出码 ${code} 结束`)
        process.exit(code)
      }
    }
    console.log('\n所有演示运行完成。\n')
    return
  }

  const demo = demos.find((d) => d.name === arg)
  if (!demo) {
    console.error(`未知演示: ${arg}`)
    printHelp()
    process.exit(1)
  }

  const code = await runDemo(demo.script)
  process.exit(code)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
