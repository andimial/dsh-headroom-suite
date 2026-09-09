/**
 * Issue #6 受控代理 runner：argv 由 src/spawn.ts 的 buildProxySpawnPlan 产出
 * （与两处启动入口完全同源），并常驻供清单验收打流量。
 * 用法：node proxy-runner.mjs third-party|official
 * 仅修正代理进程的 no_proxy（本机 host 值触发引擎启动崩溃 → issue #7）。
 */
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnPlanFor, controlledProxyEnv, pluginHomePath, EVIDENCE_DIR } from './lib.mjs'

const mode = process.argv[2] ?? 'third-party'
const plan = spawnPlanFor(mode)

// 取证：实际使用的决议摘要与 argv 记到证据目录（原位复现）。
appendFileSync(join(EVIDENCE_DIR, 'runner-spawns.jsonl'), JSON.stringify({
  ts: new Date().toISOString(), mode, upstream: plan.upstream, args: plan.args,
}) + '\n', 'utf8')
console.log(`[runner] mode=${mode} upstream=${JSON.stringify(plan.upstream)}`)
console.log(`[runner] argv=${JSON.stringify(plan.args)}`)

const child = spawn(join(pluginHomePath('venv'), 'Scripts', 'headroom.exe'), [...plan.args], {
  // 沙箱边界：spawn 捕获 stdio 会 EPERM，只能 ignore；取证靠 /stats 与 runner-spawns.jsonl。
  env: controlledProxyEnv(plan.env),
  stdio: 'ignore',
})
child.on('exit', (code, signal) => console.log(`[runner] engine exit code=${code} signal=${signal}`))
setInterval(() => {}, 1 << 30) // 常驻（后台 job 承载）
