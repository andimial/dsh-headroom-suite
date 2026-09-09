/**
 * Issue #6 清单 1（运行态）：对 proxy-runner.mjs 起的第三方上游代理发大 prompt
 * OpenAI 请求，验证「请求经代理到达第三方、压缩生效、无 502/鉴权错」。
 * 先轮询 /livez（起点正确计时，waitedMs 为真实等待时长）。
 */
import { createRecorder, tail, pluginHomePath, EVIDENCE_DIR, MOCK_BASE, PROXY_BASE, bigFiller } from './lib.mjs'
import { join } from 'node:path'

const recorder = createRecorder('checklist1-live-result.json')
const { step } = recorder

// 1) 等代理 bind（至多 180s；waitedMs 为真实等待）
let livez = null
const startAt = Date.now()
const deadline = startAt + 180000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000))
  try {
    livez = await fetch(`${PROXY_BASE}/livez`).then((r) => r.json())
    break
  } catch { /* 未 bind，继续等 */ }
}
step('1-livez', { livez, waitedMs: Date.now() - startAt })

if (livez) {
  // 2) 大 prompt + 假 key：观察压缩与鉴权（Authorization）透传
  const payload = {
    model: 'deepseek-chat',
    stream: true,
    messages: [
      { role: 'system', content: '你是用于手册验收的回声助手。' },
      { role: 'user', content: `请忽略以下填充文本并只回复 OK。\n${bigFiller()}` },
    ],
  }
  const requestBytes = Buffer.byteLength(JSON.stringify(payload))
  const at = Date.now()
  let chat
  try {
    const response = await fetch(`${PROXY_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer sk-mock-e2e-not-a-real-key' },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    chat = { status: response.status, contentType: response.headers.get('content-type'), bodyHead: text.slice(0, 240), hasMockMark: text.includes('[mock-e2e]'), latencyMs: Date.now() - at }
  } catch (error) { chat = { threw: String(error) } }
  step('2-chat-via-proxy', { requestBytes, ...chat })

  // 3) 压缩统计（/stats 的 compression 段）
  const stats = await fetch(`${PROXY_BASE}/stats`).then((r) => r.json()).catch((e) => String(e))
  step('3-stats-compression', { compression: stats?.summary?.compression ?? null, apiRequests: stats?.summary?.api_requests ?? null })
}

// 4) 证据收尾：mock 记录尾部（鉴权透传 + 到达第三方）+ runner spawn 记录
await new Promise((r) => setTimeout(r, 1500))
step('4-evidence', {
  mockRequestsTail: tail(join(EVIDENCE_DIR, 'mock-requests.jsonl'), 2200),
  runnerSpawnsTail: tail(join(EVIDENCE_DIR, 'runner-spawns.jsonl'), 700),
  mockBase: MOCK_BASE,
})

recorder.save()
process.exit(livez ? 0 : 2)
