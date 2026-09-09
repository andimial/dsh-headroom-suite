/**
 * Issue #6 清单 3（路由侧）：官方压缩线路回归。
 * 链路：停代理 → 删保存文件（模拟无第三方保存文件）→ direct（unset baseURL）
 * → headroom（压缩线路、保存文件空）→ start → 决议应=official（DeepSeek 双端点）。
 * 引擎运行态（livez/stats-history）由受控 runner official 模式另行取证
 * （本机 host 环境坏 no_proxy 会让路由 spawn 的引擎崩溃 → 另开新票）。
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const HOST = 'http://127.0.0.1:3080'
const PROXY = 'http://127.0.0.1:8787'
const sidecar = join(homedir(), '.dsh-headroom', 'saved-baseurl')
const evidence = { steps: [], t0: new Date().toISOString() }
const step = (name, data) => {
  evidence.steps.push({ name, at: new Date().toISOString(), data })
  console.log(`[step] ${name}: ${JSON.stringify(data).slice(0, 500)}`)
}

async function post(path, body) {
  const response = await fetch(HOST + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: HOST, host: new URL(HOST).host },
    body: JSON.stringify(body ?? {}),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

step('stop-proxy', await post('/headroom-mgr/stop', {}))

try { unlinkSync(sidecar); step('delete-sidecar', { removed: true }) }
catch (e) { step('delete-sidecar', { removed: false, code: e?.code }) }

step('route-direct', await post('/headroom-mgr/route', { target: 'direct' }))
step('route-headroom', await post('/headroom-mgr/route', { target: 'headroom' }))

const startAt = Date.now()
const start = await post('/headroom-mgr/start', {})
step('start-official', { ...start, waitedMs: Date.now() - startAt })

// alreadyRunning 观察：立即再点一次
step('start-again-alreadyRunning', await post('/headroom-mgr/start', {}))

const tail = (file, max = 1600) => {
  try { const t = readFileSync(file, 'utf8'); return t.length > max ? t.slice(-max) : t }
  catch (e) { return `(unreadable: ${String(e).slice(0, 90)})` }
}
step('startup-log-tail', { text: tail(join(homedir(), '.dsh-headroom', 'startup.log'), 900) })
step('sidecar-state', { exists: (() => { try { return readFileSync(sidecar, 'utf8') } catch { return null } })() })

writeFileSync(join(here, 'checklist3-route-result.json'), JSON.stringify(evidence, null, 2))
console.log('[done] -> checklist3-route-result.json')
