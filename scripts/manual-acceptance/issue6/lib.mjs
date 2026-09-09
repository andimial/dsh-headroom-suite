/**
 * Issue #6 手册验收共享 helper（避免五个脚本各自拷贝样板）。
 *
 * 关键设计：spawn argv / 保存文件路径等一律 import 自 src/（buildProxySpawnPlan、
 * resolveExpectedUpstream、paths.ts），Node 24 原生 type stripping 可直接加载——
 * 验收脚本与被测代码之间不存在手工拷贝，杜绝漂移（code-review Standards 轴）。
 * 证据统一落盘 artifacts/evidence/issue6/，重跑脚本即可原位复现提交的证据。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProxySpawnPlan } from '../../../src/spawn.ts'
import { resolveExpectedUpstream } from '../../../src/upstream.ts'
import { proxyLogPath } from '../../../src/paths.ts'

export const ISSUE6_DIR = dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = join(ISSUE6_DIR, '..', '..', '..')
export const EVIDENCE_DIR = join(PROJECT_ROOT, 'artifacts', 'evidence', 'issue6')
export const MOCK_BASE = 'http://127.0.0.1:18081'
export const PROXY_BASE = 'http://127.0.0.1:8787'
export const HOST_BASE = 'http://127.0.0.1:3080'

/** 清单 1/2 共用的大 prompt 填充文本（~50KB 中文，触发压缩）。 */
export const bigFiller = () => ('压缩验收段落。'.repeat(400) + '\n').repeat(6)

/**
 * 受控环境的 no_proxy 修正：本机 host 值含 `::1,[::1]`，httpx 误解析为端口
 * 使引擎启动即崩（见 issue #7）。仅作用于验收 spawn 的代理进程。
 */
export function controlledProxyEnv(extra = {}) {
  return {
    ...process.env,
    ...extra,
    no_proxy: 'localhost,127.0.0.1',
    NO_PROXY: 'localhost,127.0.0.1',
  }
}

/**
 * 以 #5 交付代码构造 spawn 计划：决议 + 参数构造全部来自 src/，argv 与
 * buildProxySpawnPlan 输出结构性一致（不再手工对照）。
 * mode 'third-party' 模拟「压缩线路 + 保存文件=mock 地址」的决议输入；
 * mode 'official' 模拟「无 baseURL、无保存文件」。
 */
export function spawnPlanFor(mode) {
  const upstream = mode === 'official'
    ? resolveExpectedUpstream(undefined, undefined)
    : resolveExpectedUpstream('http://127.0.0.1:8787/v1', MOCK_BASE)
  return buildProxySpawnPlan(upstream, proxyLogPath())
}

/** 验收记录器：step 收集 + 落盘到 artifacts/evidence/issue6/。 */
export function createRecorder(fileName) {
  const evidence = { steps: [], t0: new Date().toISOString() }
  return {
    evidence,
    step(name, data) {
      evidence.steps.push({ name, at: new Date().toISOString(), data })
      console.log(`[step] ${name}: ${JSON.stringify(data).slice(0, 600)}`)
    },
    save() {
      const target = join(EVIDENCE_DIR, fileName)
      writeFileSync(target, JSON.stringify(evidence, null, 2))
      console.log(`[done] -> ${target}`)
      return target
    },
  }
}

/** 带 Origin 头的 host 路由 POST（过 CSRF 守卫）。 */
export async function postHost(path, body) {
  const response = await fetch(HOST_BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: HOST_BASE, host: new URL(HOST_BASE).host },
    body: JSON.stringify(body ?? {}),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

/** 读文件尾部（证据摘录）；不可读时如实返回，不伪造。 */
export function tail(file, max = 3000) {
  try {
    const text = readFileSync(file, 'utf8')
    return text.length > max ? text.slice(-max) : text
  } catch (error) {
    return `(unreadable: ${String(error).slice(0, 90)})`
  }
}

/** 插件 home 下的文件路径（与 src/paths.ts 同源推导，避免手拼 USERPROFILE）。 */
export const pluginHomePath = (name) => join(homedir(), '.dsh-headroom', name)
