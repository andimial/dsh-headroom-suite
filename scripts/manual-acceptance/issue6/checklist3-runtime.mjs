/**
 * Issue #6 清单 3（运行态）：官方上游代理的 livez/readyz/stats-history +
 * alreadyRunning 行为验证（proxy-runner.mjs official 提供活代理）。
 */
import { createRecorder, postHost, tail, pluginHomePath, PROXY_BASE } from './lib.mjs'

const recorder = createRecorder('checklist3-runtime-result.json')
const { step } = recorder

const get = async (path, timeoutMs = 8000) => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(PROXY_BASE + path, { signal: controller.signal })
    clearTimeout(timer)
    return { status: response.status, body: await response.json().catch(() => null) }
  } catch (error) { return { threw: String(error).slice(0, 160) } }
}

step('livez', await get('/livez'))
step('readyz', await get('/readyz', 30000))
const history = await get('/stats-history')
step('stats-history', {
  lifetime: history?.body?.lifetime ?? null,
  storagePath: history?.body?.storage_path ?? null,
})

// alreadyRunning：代理活着时，路由 start 应早退且不重启
step('already-running', await postHost('/headroom-mgr/start', {}))
// 未重启证据：startup.log 在本次调用后无新增 spawn 行
step('startup-log-tail', { text: tail(pluginHomePath('startup.log'), 700) })

recorder.save()
