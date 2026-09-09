/**
 * Issue #6 清单 2：第三方上游下把 Claude Code（Anthropic 协议）指向代理。
 * 预期：请求在本地失败/明确报错；占位记录器（127.0.0.1:9）命中；
 * 代理日志显示 anthropic 路线被钉在占位，无外发。
 * 同时补清单 1 的压缩生效证据（/stats + mock 记录 + proxy.log）。
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PROXY = 'http://127.0.0.1:8787'
const evidence = { steps: [], t0: new Date().toISOString() }
const step = (name, data) => {
  evidence.steps.push({ name, at: new Date().toISOString(), data })
  console.log(`[step] ${name}: ${JSON.stringify(data).slice(0, 600)}`)
}

// 清单 1 补充证据：再发一次经代理请求（非流式，便于 /stats 对账）
const filler = ('压缩验收段落。'.repeat(400) + '\n').repeat(6)
const payload = {
  model: 'deepseek-chat',
  stream: false,
  messages: [
    { role: 'system', content: '你是用于手册验收的回声助手。' },
    { role: 'user', content: `请忽略以下填充文本并只回复 OK。\n${filler}` },
  ],
}
const requestBytes = Buffer.byteLength(JSON.stringify(payload))
let chat
try {
  const response = await fetch(`${PROXY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-mock-e2e-not-a-real-key' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  chat = { status: response.status, hasMockMark: text.includes('[mock-e2e]'), bodyHead: text.slice(0, 200) }
} catch (e) { chat = { threw: String(e) } }
step('c1-chat-again', { requestBytes, ...chat })

// Claude Code 指向代理时的典型请求形态：POST /v1/messages（Anthropic 协议）
const anthropicPayload = {
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 64,
  messages: [{ role: 'user', content: 'ping via claude code' }],
}
let messages
try {
  const response = await fetch(`${PROXY}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-mock-e2e-not-a-real-key',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicPayload),
  })
  const text = await response.text()
  messages = { status: response.status, bodyHead: text.slice(0, 400) }
} catch (e) { messages = { threw: String(e) } }
step('c2-post-v1-messages', messages)

// 证据收尾
const tail = (file, max = 3000) => {
  try { const t = readFileSync(file, 'utf8'); return t.length > max ? t.slice(-max) : t }
  catch (e) { return `(unreadable: ${String(e).slice(0, 90)})` }
}
await new Promise((r) => setTimeout(r, 2000))
const stats = await fetch(`${PROXY}/stats`).then((r) => r.json()).catch((e) => String(e))
step('stats-after-requests', { summary: stats?.summary ?? null, requests: stats?.requests ?? stats?.summary?.requests ?? null, statsFull: JSON.stringify(stats).slice(0, 1600) })
step('evidence', {
  mockRequestsTail: tail(join(here, 'mock-requests.jsonl'), 2000),
  placeholderPort9Tail: tail(join(here, 'placeholder-port9.jsonl'), 1200),
  proxyLogTail: tail(join(homedir(), '.dsh-headroom', 'proxy.log'), 2400),
})

writeFileSync(join(here, 'checklist2-result.json'), JSON.stringify(evidence, null, 2))
appendFileSync(join(here, 'run-notes.md'), `清单 2 执行于 ${new Date().toISOString()}\n`)
console.log('[done] -> checklist2-result.json')
