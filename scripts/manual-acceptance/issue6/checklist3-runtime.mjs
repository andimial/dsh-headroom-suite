/**
 * Issue #6 清单 3（运行态）：官方上游代理的 livez/readyz/stats-history +
 * alreadyRunning 行为验证（受控 runner 提供活代理）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PROXY = 'http://127.0.0.1:8787'
const HOST = 'http://127.0.0.1:3080'
const evidence = { steps: [], t0: new Date().toISOString() }
const step = (name, data) => {
  evidence.steps.push({ name, at: new Date().toISOString(), data })
  console.log(`[step] ${name}: ${JSON.stringify(data).slice(0, 900)}`)
}

const get = async (path, timeoutMs = 8000) => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(PROXY + path, { signal: controller.signal })
    clearTimeout(timer)
    return { status: response.status, body: await response.json().catch(() => null) }
  } catch (e) { return { threw: String(e).slice(0, 160) } }
}

step('livez', await get('/livez'))
step('readyz', await get('/readyz', 30000))
const history = await get('/stats-history')
step('stats-history', {
  lifetime: history?.body?.lifetime ?? null,
  sessionsHead: Array.isArray(history?.body?.sessions) ? history.body.sessions.length : null,
  rawHead: JSON.stringify(history?.body ?? history).slice(0, 900),
})
step('stats', await get('/stats'))

// alreadyRunning：代理活着时，路由 start 应早退且不重启
const response = await fetch(HOST + '/headroom-mgr/start', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: HOST, host: new URL(HOST).host },
  body: JSON.stringify({}),
})
step('already-running', { status: response.status, body: await response.json().catch(() => null) })
// 活代理端口 PID 未变（未重启）证据
const { execSync } = await import('node:child_process')
step('port-pid-after', { netstat: execSync('netstat -ano | findstr ":8787" | findstr LISTENING', { encoding: 'utf8' }).trim() })

const tail = (file, max = 1200) => {
  try { const t = readFileSync(file, 'utf8'); return t.length > max ? t.slice(-max) : t }
  catch (e) { return `(unreadable: ${String(e).slice(0, 90)})` }
}
step('startup-log-tail', { text: tail(join(homedir(), '.dsh-headroom', 'startup.log'), 700) })

writeFileSync(join(here, 'checklist3-runtime-result.json'), JSON.stringify(evidence, null, 2))
console.log('[done] -> checklist3-runtime-result.json')
