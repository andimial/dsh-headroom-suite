/**
 * Issue #6 清单 2：第三方上游下把 Claude Code（Anthropic 协议）指向代理。
 * 预期：请求在本地失败/明确报错；占位记录器（127.0.0.1:9）命中；
 * 请求终结于本地占位，不外发到任何真实 anthropic 端点。
 * 注意：本脚本与占位记录器都只检查 authorization 头；x-api-key 的透传未取证
 * （引擎层鉴权差异 Out of Scope），报告已声明该盲点。
 */
import { join } from 'node:path'
import { createRecorder, tail, pluginHomePath, EVIDENCE_DIR, PROXY_BASE, bigFiller } from './lib.mjs'

const recorder = createRecorder('checklist2-result.json')
const { step } = recorder

// 清单 1 补充：非流式经代理请求（便于 /stats 对账）
const payload = {
  model: 'deepseek-chat',
  stream: false,
  messages: [
    { role: 'system', content: '你是用于手册验收的回声助手。' },
    { role: 'user', content: `请忽略以下填充文本并只回复 OK。\n${bigFiller()}` },
  ],
}
const requestBytes = Buffer.byteLength(JSON.stringify(payload))
let chat
try {
  const response = await fetch(`${PROXY_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-mock-e2e-not-a-real-key' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  chat = { status: response.status, hasMockMark: text.includes('[mock-e2e]'), bodyHead: text.slice(0, 200) }
} catch (error) { chat = { threw: String(error) } }
step('c1-chat-again-nonstream', { requestBytes, ...chat })

// Claude Code 指向代理时的典型请求形态：POST /v1/messages（Anthropic 协议）
const anthropicPayload = {
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 64,
  messages: [{ role: 'user', content: 'ping via claude code' }],
}
let messages
try {
  const response = await fetch(`${PROXY_BASE}/v1/messages`, {
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
} catch (error) { messages = { threw: String(error) } }
step('c2-post-v1-messages', messages)

// 证据收尾：占位命中记录（不外发的直接证据）+ 压缩统计
await new Promise((r) => setTimeout(r, 2000))
const stats = await fetch(`${PROXY_BASE}/stats`).then((r) => r.json()).catch((e) => String(e))
step('stats-after-requests', { summary: stats?.summary ?? null })
step('evidence', {
  placeholderPort9Tail: tail(join(EVIDENCE_DIR, 'placeholder-port9.jsonl'), 1400),
  mockRequestsTail: tail(join(EVIDENCE_DIR, 'mock-requests.jsonl'), 1200),
  startupLogTail: tail(pluginHomePath('startup.log'), 500),
})

recorder.save()
