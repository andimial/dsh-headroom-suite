/**
 * Issue #6 清单 1：录第三方 → 切压缩线路 → 启动 → 请求经代理到达第三方。
 * 走真实插件路由（host webServer :3080，带 Origin 过 CSRF 守卫），证据落盘。
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const HOST = 'http://127.0.0.1:3080'
const PROXY = 'http://127.0.0.1:8787'
const MOCK = 'http://127.0.0.1:18081'
const evidence = { steps: [], t0: new Date().toISOString() }

function step(name, data) {
  evidence.steps.push({ name, at: new Date().toISOString(), data })
  console.log(`[step] ${name}: ${JSON.stringify(data).slice(0, 400)}`)
}

async function post(path, body) {
  const response = await fetch(HOST + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: HOST, host: new URL(HOST).host },
    body: JSON.stringify(body ?? {}),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

// 1) 录第三方：baseURL 直写 mock 端点（第三方直发线路）
step('1-record-third-party', await post('/headroom-mgr/route', { target: 'third-party', baseURL: MOCK }))

// 2) 切压缩线路：baseURL → 本地代理，第三方地址进保存文件
step('2-switch-headroom', await post('/headroom-mgr/route', { target: 'headroom' }))

// 3) 启动代理（决议应取保存文件 → 第三方上游）
const startAt = Date.now()
const startResult = await post('/headroom-mgr/start', {})
step('3-start-proxy', { ...startResult, waitedMs: Date.now() - startAt })

// 4) 经代理发 OpenAI 协议请求（大 prompt，观察压缩；假 key，观察鉴权透传）
const filler = ('压缩验收段落。'.repeat(400) + '\n').repeat(6) // ~30KB 中文文本
const requestPayload = {
  model: 'deepseek-chat',
  stream: true,
  messages: [
    { role: 'system', content: '你是用于手册验收的回声助手。' },
    { role: 'user', content: `请忽略以下填充文本并只回复 OK。\n${filler}` },
  ],
}
const payloadBytes = Buffer.byteLength(JSON.stringify(requestPayload))
const reqAt = Date.now()
let chatResult
try {
  const response = await fetch(`${PROXY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-mock-e2e-not-a-real-key' },
    body: JSON.stringify(requestPayload),
  })
  const text = await response.text()
  chatResult = {
    status: response.status,
    contentType: response.headers.get('content-type'),
    bodyHead: text.slice(0, 300),
    containsMockMark: text.includes('[mock-e2e]'),
    latencyMs: Date.now() - reqAt,
  }
} catch (error) {
  chatResult = { threw: String(error), latencyMs: Date.now() - reqAt }
}
step('4-chat-via-proxy', { requestBytes: payloadBytes, ...chatResult })

// 5) 代理健康与统计（压缩生效观察：requests 计数、/stats）
const livez = await fetch(`${PROXY}/livez`).then((r) => r.json()).catch((e) => String(e))
const stats = await fetch(`${PROXY}/stats`).then((r) => r.json()).catch((e) => String(e))
const history = await fetch(`${PROXY}/stats-history`).then((r) => r.json()).catch((e) => String(e))
step('5-proxy-health-stats', { livez, statsHead: JSON.stringify(stats).slice(0, 1200), historyLifetime: history?.lifetime ?? null })

// 6) 证据收尾：mock 请求记录、占位记录、startup.log 尾行、proxy.log 尾部
const readTail = (file, maxBytes = 4000) => {
  try {
    const text = readFileSync(file, 'utf8')
    return text.length > maxBytes ? text.slice(-maxBytes) : text
  } catch (e) { return `(<unreadable: ${String(e).slice(0, 80)}>)` }
}
const home = process.env.USERPROFILE + '\\.dsh-headroom'
step('6-evidence', {
  mockRequestsTail: readTail(join(here, 'mock-requests.jsonl'), 2500),
  startupLogTail: readTail(join(home, 'startup.log'), 800),
  proxyLogTail: readTail(join(home, 'proxy.log'), 2500),
  sidecarExists: (() => { try { return readFileSync(join(home, 'saved-baseurl'), 'utf8') } catch { return null } })(),
})

writeFileSync(join(here, 'checklist1-result.json'), JSON.stringify(evidence, null, 2))
appendFileSync(join(here, 'run-notes.md'), `\n\n## 清单 1 执行于 ${new Date().toISOString()}\n见 checklist1-result.json\n`)
console.log('[done] checklist1 -> checklist1-result.json')
