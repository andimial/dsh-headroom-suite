/**
 * 面板健康探测与统计的回归锁定（issue：桌面端「Headroom 当前不可达」）。
 *
 * 两个根因，各锁一条：
 *  1. 面板曾直接 fetch `http://127.0.0.1:8787/livez` / `/stats`。桌面端渲染进程
 *     origin 是 `dsh-app://app`（Electron registerSchemesAsPrivileged standard+
 *     corsEnabled），Headroom 的 CORS 策略只认 `https?://(localhost|127.0.0.1|
 *     \[::1\])`，响应被浏览器拦下 → 代理明明在跑也永远显示「不可达」、统计全 0。
 *     改为读同源宿主路由 `/headroom-mgr/status`、`/headroom-mgr/stats`（宿主在
 *     Node 侧探 loopback，无 CORS）。
 *  2. 探针曾是一次性的（`probe.kind === 'idle'` 才跑），首次失败即终态：代理冷启动
 *     （预加载压缩器 >2 分钟）、重启、休眠唤醒后，徽标一直红到页面重挂载。故改为
 *     轮询 watch —— 失败后必须能自行恢复。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MGR_STATS_PATH, MGR_STATUS_PATH } from '../src/constants.ts'
import { HEADROOM_WATCH_INTERVAL_MS, probeHeadroom, startHeadroomWatch } from '../src/client/probe.ts'
import type { HeadroomProbeState, HeadroomWatchEvent } from '../src/client/probe.ts'
import { EMPTY_STATS, fetchHeadroomStats } from '../src/client/stats.ts'

/** 把一次 fetch 调用记为 { url, init } 的桩，返回给定响应。 */
function stubFetch(response: { ok?: boolean, json?: () => Promise<unknown>, reject?: Error }): { calls: string[] } {
  const calls: string[] = []
  vi.stubGlobal('fetch', (url: unknown) => {
    calls.push(String(url))
    if (response.reject !== undefined) return Promise.reject(response.reject)
    return Promise.resolve({
      ok: response.ok ?? true,
      json: response.json ?? (() => Promise.resolve({})),
    })
  })
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('probeHeadroom（同源宿主路由，不直连 loopback）', () => {
  it('读 /headroom-mgr/status 而不是 http://127.0.0.1:8787/livez（桌面端 CORS 回归）', async () => {
    const { calls } = stubFetch({ json: () => Promise.resolve({ running: true, version: '0.37.0' }) })
    const state = await probeHeadroom()
    expect(calls).toEqual([MGR_STATUS_PATH])
    expect(state).toEqual({ kind: 'healthy', version: '0.37.0' })
  })

  it('running=false → down', async () => {
    stubFetch({ json: () => Promise.resolve({ running: false }) })
    expect(await probeHeadroom()).toEqual({ kind: 'down' })
  })

  it('传输失败 / 非 2xx / 缺版本号 → down 或版本占位', async () => {
    stubFetch({ reject: new TypeError('Failed to fetch') })
    expect(await probeHeadroom()).toEqual({ kind: 'down' })

    stubFetch({ ok: false })
    expect(await probeHeadroom()).toEqual({ kind: 'down' })

    stubFetch({ json: () => Promise.resolve({ running: true }) })
    expect(await probeHeadroom()).toEqual({ kind: 'healthy', version: '?' })
  })
})

describe('startHeadroomWatch（失败可自愈）', () => {
  it('先报 probing，失败后下一轮恢复 healthy（回归：旧一次性探针永久停在 down）', async () => {
    vi.useFakeTimers()
    let up = false
    const events: HeadroomWatchEvent[] = []
    const stop = startHeadroomWatch(
      () => Promise.resolve<HeadroomProbeState>(up ? { kind: 'healthy', version: '0.37.0' } : { kind: 'down' }),
      (event) => events.push(event),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual([{ kind: 'probing' }, { kind: 'down' }])

    up = true
    await vi.advanceTimersByTimeAsync(HEADROOM_WATCH_INTERVAL_MS)
    expect(events.at(-1)).toEqual({ kind: 'healthy', version: '0.37.0' })

    stop()
  })

  it('dispose 后不再探测，且在途结果被丢弃', async () => {
    vi.useFakeTimers()
    const events: HeadroomWatchEvent[] = []
    let resolve: ((state: HeadroomProbeState) => void) | undefined
    const stop = startHeadroomWatch(
      () => new Promise<HeadroomProbeState>((r) => { resolve = r }),
      (event) => events.push(event),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(events).toEqual([{ kind: 'probing' }])
    stop()
    resolve?.({ kind: 'healthy', version: '0.37.0' })
    await vi.advanceTimersByTimeAsync(HEADROOM_WATCH_INTERVAL_MS * 3)
    expect(events).toEqual([{ kind: 'probing' }])
  })

  it('慢探测不叠加：在途期间的 tick 被跳过', async () => {
    vi.useFakeTimers()
    let probes = 0
    let resolve: ((state: HeadroomProbeState) => void) | undefined
    const stop = startHeadroomWatch(
      () => { probes += 1; return new Promise<HeadroomProbeState>((r) => { resolve = r }) },
      () => {},
    )
    await vi.advanceTimersByTimeAsync(HEADROOM_WATCH_INTERVAL_MS * 5)
    expect(probes).toBe(1)
    resolve?.({ kind: 'healthy', version: '0.37.0' })
    await vi.advanceTimersByTimeAsync(HEADROOM_WATCH_INTERVAL_MS)
    expect(probes).toBe(2)
    stop()
  })
})

describe('fetchHeadroomStats（同源宿主路由）', () => {
  it('读 /headroom-mgr/stats 并投影面板数字', async () => {
    const { calls } = stubFetch({
      json: () => Promise.resolve({
        persistent_savings: {
          lifetime: { requests: 12, tokens_saved: 3456, total_input_tokens: 7890 },
          display_session: { total_input_tokens: 1234, tokens_saved: 99 },
        },
        prefix_cache: { totals: { hit_rate: 42.5 } },
      }),
    })
    const stats = await fetchHeadroomStats()
    expect(calls).toEqual([MGR_STATS_PATH])
    expect(stats).toEqual({
      inputTokens: 1234,
      tokensSaved: 3456,
      sessionSavedTokens: 99,
      lifetimeInputTokens: 7890,
      cacheHitRate: 42.5,
      requests: 12,
      ok: true,
    })
  })

  it('代理不可达（宿主 503）→ EMPTY_STATS，ok=false', async () => {
    stubFetch({ ok: false })
    expect(await fetchHeadroomStats()).toEqual(EMPTY_STATS)
  })
})
