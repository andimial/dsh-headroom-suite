/**
 * Issue #6 清单 1（路由链路）：写第三方地址 → 切压缩线路 → 启动。
 * 只验证插件路由侧的决议/构造/日志（upstream 摘要与 startup.log）；
 * 引擎运行态由 proxy-runner.mjs + checklist1-live.mjs 承担
 * （本机 host 环境坏 no_proxy 会让路由 spawn 的引擎崩溃 → issue #7）。
 */
import { createRecorder, postHost, MOCK_BASE, pluginHomePath, tail } from './lib.mjs'

const recorder = createRecorder('checklist1-route-result.json')
const { step } = recorder

// 1) 写第三方地址：baseURL 直写 mock 端点（第三方直发线路）
step('1-record-third-party-address', await postHost('/headroom-mgr/route', { target: 'third-party', baseURL: MOCK_BASE }))

// 2) 切压缩线路：baseURL → 本地代理，第三方地址进保存文件
step('2-switch-headroom', await postHost('/headroom-mgr/route', { target: 'headroom' }))

// 3) 启动代理（决议应取保存文件 → 第三方上游；healthyAfterStart 受本机坏 no_proxy 影响，见 issue #7）
const startAt = Date.now()
const start = await postHost('/headroom-mgr/start', {})
step('3-start-proxy', { ...start, waitedMs: Date.now() - startAt })

// 4) 证据收尾：startup.log 决议行 + 保存文件内容（readSavedBaseURL 的落点）
step('4-evidence', {
  startupLogTail: tail(pluginHomePath('startup.log'), 800),
  savedBaseURL: tail(pluginHomePath('saved-baseurl'), 120),
})

recorder.save()
