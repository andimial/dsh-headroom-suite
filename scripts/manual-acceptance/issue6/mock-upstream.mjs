/**
 * Issue #6 手册验收 — 模拟 OpenAI 兼容第三方端点 + Anthropic 占位记录器。
 *
 * 端口 18081：模拟第三方（OpenAI 协议）。记录每个请求的
 * method/path/Authorization 存在性与前缀/content-type/body 字节数/body 摘要
 * 到 mock-requests.jsonl（不落完整 key）。/v1/chat/completions 支持流式与非流式。
 *
 * 端口 9：Anthropic 占位（http://127.0.0.1:9）记录器。命中即记录到
 * placeholder-port9.jsonl，随后立刻 socket.destroy() 模拟「不可达占位」——
 * 客户端侧表现为连接被重置（本地失败），同时留下「请求打到占位而非外发」的证据。
 */
import { createServer } from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { EVIDENCE_DIR } from './lib.mjs'

// 记录落盘到证据目录（原位复现提交的证据）。
mkdirSync(EVIDENCE_DIR, { recursive: true })
const logOpenAI = join(EVIDENCE_DIR, 'mock-requests.jsonl')
const logPort9 = join(EVIDENCE_DIR, 'placeholder-port9.jsonl')

function record(file, entry) {
  appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
}

function snippet(text, max = 800) {
  return text.length <= max ? text : text.slice(0, max) + `…(+${text.length - max}B)`
}

const openai = createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const auth = req.headers.authorization ?? ''
    record(logOpenAI, {
      ts: new Date().toISOString(),
      method: req.method,
      url: req.url,
      authPresent: auth.length > 0,
      authPrefix: auth.slice(0, 12),
      contentType: req.headers['content-type'] ?? null,
      bodyBytes: Buffer.byteLength(body),
      bodySnippet: snippet(body),
    })
    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        object: 'list',
        data: [{ id: 'mock-third-party-model', object: 'model', owned_by: 'mock-e2e' }],
      }))
      return
    }
    if (req.method === 'POST' && (req.url === '/v1/chat/completions' || req.url === '/chat/completions')) {
      let parsed = {}
      try { parsed = JSON.parse(body) } catch { /* 保持空对象，走缺省响应 */ }
      const model = parsed.model ?? 'mock-third-party-model'
      if (parsed.stream === true) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        })
        const frame = (delta, finish) => JSON.stringify({
          id: 'chatcmpl-mock-e2e', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000),
          model, choices: [{ index: 0, delta, finish_reason: finish ?? null }],
        })
        res.write(`data: ${frame({ role: 'assistant' })}\n\n`)
        res.write(`data: ${frame({ content: '[mock-e2e] third-party upstream reached through headroom proxy' })}\n\n`)
        res.write(`data: ${frame({}, 'stop')}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          id: 'chatcmpl-mock-e2e', object: 'chat.completion', created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: '[mock-e2e] third-party upstream reached through headroom proxy' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 9, total_tokens: 10 },
        }))
      }
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `mock-e2e: no route for ${req.method} ${req.url}`, type: 'not_found' } }))
  })
})

openai.listen(18081, '127.0.0.1', () => {
  console.log('[mock-e2e] third-party upstream on http://127.0.0.1:18081')
})

const port9 = createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    record(logPort9, {
      ts: new Date().toISOString(),
      method: req.method,
      url: req.url,
      authPresent: (req.headers.authorization ?? '').length > 0,
      authPrefix: (req.headers.authorization ?? '').slice(0, 12),
      host: req.headers.host ?? null,
      bodyBytes: Buffer.byteLength(body),
      bodySnippet: snippet(body),
    })
    // 模拟不可达占位：记录后立即断开，客户端侧表现为连接重置（本地失败）。
    res.socket.destroy()
  })
})
port9.on('error', (err) => {
  console.log(`[mock-e2e] port 9 listener unavailable (${err.code}) — placeholder stays refused-by-nothing; evidence falls back to argv + proxy 502`)
})
port9.listen(9, '127.0.0.1', () => {
  console.log('[mock-e2e] anthropic placeholder recorder on 127.0.0.1:9 (records then resets)')
})
