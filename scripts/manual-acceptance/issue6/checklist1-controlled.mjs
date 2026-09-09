/**
 * Issue #6 清单 1（受控环境执行）。
 *
 * 背景：本机 host 进程环境 no_proxy 含 `::1,[::1]`，httpx 误解析为端口，
 * LiteLLM 启动期拉 model cost map 崩溃，代理永不 bind（→ 新票记录）。
 * 此脚本用与 buildProxySpawnPlan 逐字一致的 argv + HEADROOM_ENV_PRESET
 * spawn 引擎，仅把代理进程的 no_proxy 修正为可解析值（localhost,127.0.0.1）；
 * 决议与参数构造本身已由插件路由验证（checklist1-result.json 步骤 3 与
 * startup.log）。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PROXY = 'http://127.0.0.1:8787'
const evidence = { steps: [], t0: new Date().toISOString() }
const step = (name, data) => {
  evidence.steps.push({ name, at: new Date().toISOString(), data })
  console.log(`[step] ${name}: ${JSON.stringify(data).slice(0, 500)}`)
}

// 与 src/spawn.ts buildProxySpawnPlan 第三方分支逐字一致
const argv = [
  'proxy', '--port', '8787',
  '--anthropic-api-url', 'http://127.0.0.1:9',
  '--openai-api-url', 'http://127.0.0.1:18081',
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
  // 受控修正：仅本代理进程。坏值 `::1,[::1]` 是 httpx 崩溃根因。
  no_proxy: 'localhost,127.0.0.1',
  NO_PROXY: 'localhost,127.0.0.1',
}
const child = spawn(join(homedir(), '.dsh-headroom', 'venv', 'Scripts', 'headroom.exe'), argv, {
  stdio: 'ignore',
  env,
  detached: false,
})
step('spawn', { pid: child.pid, argv, envPresetKeys: Object.keys(env).filter((k) => k.startsWith('HEADROOM_')) })

// 轮询 livez 至多 180s
let livez = null
const deadline = Date.now() + 180000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000))
  try {
    livez = await fetch(`${PROXY}/livez`).then((r) => r.json())
    break
  } catch { /* 未 bind，继续等 */ }
}
step('livez', { livez, waitedMs: Date.now() - (Date.now() - 180000) })

if (livez) {
  // 大 prompt + 假 key：观察压缩与鉴权透传
  const filler = ('压缩验收段落。'.repeat(400) + '\n').repeat(6)
  const payload = {
    model: 'deepseek-chat',
    stream: true,
    messages: [
      { role: 'system', content: '你是用于手册验收的回声助手。' },
      { role: 'user', content: `请忽略以下填充文本并只回复 OK。\n${filler}` },
    ],
  }
  const requestBytes = Buffer.byteLength(JSON.stringify(payload))
  const at = Date.now()
  let chat
  try {
    const response = await fetch(`${PROXY}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer sk-mock-e2e-not-a-real-key' },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    chat = { status: response.status, contentType: response.headers.get('content-type'), bodyHead: text.slice(0, 240), hasMockMark: text.includes('[mock-e2e]'), latencyMs: Date.now() - at }
  } catch (e) { chat = { threw: String(e) } }
  step('chat-via-proxy', { requestBytes, ...chat })

  const stats = await fetch(`${PROXY}/stats`).then((r) => r.text()).catch((e) => String(e))
  const readyz = await fetch(`${PROXY}/readyz`).then((r) => r.text()).catch((e) => String(e))
  step('stats-readyz', { readyz: readyz.slice(0, 400), statsHead: stats.slice(0, 1500) })
}

// 证据：mock 记录尾部 + proxy.log 尾部
const tail = (file, max = 3000) => {
  try { const t = readFileSync(file, 'utf8'); return t.length > max ? t.slice(-max) : t }
  catch (e) { return `(unreadable: ${String(e).slice(0, 80)})` }
}
await new Promise((r) => setTimeout(r, 1500))
step('evidence', {
  mockRequestsTail: tail(join(here, 'mock-requests.jsonl'), 2200),
  placeholderPort9Tail: tail(join(here, 'placeholder-port9.jsonl'), 800),
  proxyLogTail: tail(join(homedir(), '.dsh-headroom', 'proxy.log'), 2200),
})

writeFileSync(join(here, 'checklist1-controlled-result.json'), JSON.stringify(evidence, null, 2))
appendFileSync(join(here, 'run-notes.md'), `清单 1（受控）执行于 ${new Date().toISOString()}\n`)
console.log('[done] -> checklist1-controlled-result.json')
process.exit(livez ? 0 : 2)
