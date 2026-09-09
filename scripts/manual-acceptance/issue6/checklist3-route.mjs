/**
 * Issue #6 清单 3（路由侧）：官方压缩线路回归。
 * 链路：停代理 → 删保存文件（模拟无第三方保存文件）→ direct（unset baseURL）
 * → headroom（压缩线路、保存文件空）→ start → 决议应=official（DeepSeek 双端点）。
 * 引擎运行态（livez/stats-history）由受控 runner official 模式另行取证
 * （本机 host 环境坏 no_proxy 会让路由 spawn 的引擎崩溃 → issue #7）。
 */
import { unlinkSync } from 'node:fs'
import { createRecorder, postHost, pluginHomePath, tail } from './lib.mjs'

const recorder = createRecorder('checklist3-route-result.json')
const { step } = recorder

step('stop-proxy', await postHost('/headroom-mgr/stop', {}))

// 删保存文件 = 模拟「没有第三方保存文件」的用户状态（保存文件由插件管理，属验收操作面）
const sidecar = pluginHomePath('saved-baseurl')
try { unlinkSync(sidecar); step('delete-sidecar', { removed: true }) }
catch (error) { step('delete-sidecar', { removed: false, code: error?.code }) }

step('route-direct', await postHost('/headroom-mgr/route', { target: 'direct' }))
step('route-headroom', await postHost('/headroom-mgr/route', { target: 'headroom' }))

const startAt = Date.now()
const start = await postHost('/headroom-mgr/start', {})
step('start-official', { ...start, waitedMs: Date.now() - startAt })

// alreadyRunning 观察：立即再点一次（引擎未 bind 时会再次决议+spawn，见证据注释）
step('start-again', await postHost('/headroom-mgr/start', {}))

step('startup-log-tail', { text: tail(pluginHomePath('startup.log'), 900) })

recorder.save()
