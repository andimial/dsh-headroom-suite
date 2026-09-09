/**
 * Issue #6 受控代理 runner：以与 buildProxySpawnPlan 逐字一致的 argv spawn
 * headroom 引擎并常驻（后台 job），stdout/stderr 落盘供取证。
 * 用法：node proxy-runner.mjs third-party|official
 * 仅修正代理进程的 no_proxy（本机环境 `::1,[::1]` 触发 httpx 崩溃 → 另行开票）。
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const mode = process.argv[2] ?? 'third-party'
const targets = mode === 'official'
  ? { anthropic: 'https://api.deepseek.com/anthropic', openai: 'https://api.deepseek.com' }
  : { anthropic: 'http://127.0.0.1:9', openai: 'http://127.0.0.1:18081' }

const argv = [
  'proxy', '--port', '8787',
  '--anthropic-api-url', targets.anthropic,
  '--openai-api-url', targets.openai,
  '--host', '127.0.0.1',
  '--connect-timeout-seconds', '15',
  '--request-timeout-seconds', '120',
  '--log-file', join(homedir(), '.dsh-headroom', 'proxy.log'),
]
const env = {
  ...process.env,
  HEADROOM_DETECT_BACKEND: 'python',
  HEADROOM_TOOL_SEARCH: 'off',
  HEADROOM_DISABLE_KOMPRESS: '1',
  no_proxy: 'localhost,127.0.0.1',
  NO_PROXY: 'localhost,127.0.0.1',
}
// 沙箱边界：spawn 捕获 stdio 会 EPERM，只能 ignore；取证靠引擎 --log-file 与 /stats。
const child = spawn(join(homedir(), '.dsh-headroom', 'venv', 'Scripts', 'headroom.exe'), argv, { env, stdio: 'ignore' })
setInterval(() => {}, 1 << 30) // 常驻
