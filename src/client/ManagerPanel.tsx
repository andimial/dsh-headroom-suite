/**
 * ManagerPanel: the "代理管理" settings section (merged from
 * dsh-headroom-manager). Process lifecycle UI — start/stop headroom.exe,
 * health badge, lifetime savings — driven by the /headroom-mgr/* HTTP routes.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

const STATUS_URL = '/headroom-mgr/status'
const START_URL = '/headroom-mgr/start'
const STOP_URL = '/headroom-mgr/stop'

function fetchJson(url: string, opts?: RequestInit): Promise<Record<string, unknown>> {
  return fetch(url, Object.assign({ cache: 'no-store' }, opts)).then((r) => r.json())
}

function postJson(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).then((r) => r.json().then((b) => ({ status: r.status, body: b as Record<string, unknown> })))
}

const fmtUsd = (v: unknown): string => (typeof v === 'number' ? '$' + v.toFixed(2) : '—')
const fmtTok = (v: unknown): string => (typeof v === 'number' ? v.toLocaleString() : '—')

/** Copy for the manager section (kept local — no locale service dependency). */
const zh = {
  nav: '代理管理',
  procStatus: 'Headroom 进程',
  probing: '探测中…',
  running: '运行中',
  stopped: '未运行',
  btnStart: '启动代理进程',
  btnStop: '停止代理进程',
  starting: '启动中…',
  stopping: '停止中…',
  startOk: '✅ 代理已启动并通过健康检查',
  startedSlow: '⚠️ 已发出启动命令，但健康检查尚未通过（可能仍在初始化，稍后刷新查看）',
  startFail: '❌ 启动失败',
  stopOk: '✅ 代理已停止',
  stopFail: '❌ 停止失败',
  savingsTitle: '累计节省统计（lifetime）',
  totalRequests: '处理请求数',
  cacheSaved: '缓存命中节省',
  compressSaved: '上下文压缩节省',
  compressTokens: '压缩节省 token 数',
}

interface StatusBody {
  running?: boolean
  version?: string
  pid?: string | number
  savings?: {
    requests?: number
    cache_savings_usd?: number
    compression_savings_usd?: number
    tokens_saved?: number
  } | null
}

export function ManagerPanel(): ReactNode {
  const [st, setSt] = useState<StatusBody>({ })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetchJson(STATUS_URL).then((s) => {
      setSt(s as StatusBody)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => clearInterval(timer)
  }, [refresh])

  const doStart = async (): Promise<void> => {
    setBusy('start'); setMsg(null)
    try {
      const r = await postJson(START_URL)
      if (r.body.ok && r.body.healthyAfterStart) setMsg(zh.startOk)
      else if (r.body.ok) setMsg(zh.startedSlow)
      else setMsg(zh.startFail + ': ' + JSON.stringify(r.body))
      refresh()
    } catch (e) { setMsg(zh.startFail + ': ' + String(e)) }
    setBusy('')
  }
  const doStop = async (): Promise<void> => {
    setBusy('stop'); setMsg(null)
    try {
      const r = await postJson(STOP_URL)
      setMsg(r.body.ok ? zh.stopOk : zh.stopFail + ': ' + JSON.stringify(r.body))
      refresh()
    } catch (e) { setMsg(zh.stopFail + ': ' + String(e)) }
    setBusy('')
  }

  const running = st.running === true
  const sv = st.savings ?? {}
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} aria-label={zh.nav}>
      <div style={{ border: '1px solid var(--dsw-color-border-strong,#d0d7de)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--dsw-color-text-secondary,#57606a)', fontSize: '13px' }}>{zh.procStatus}</span>
          {loading
            ? <span style={{ fontSize: '13px', color: '#57606a' }}>{zh.probing}</span>
            : running
              ? <span style={{ borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600, background: 'var(--dsw-color-success-bg,#dafbe1)', color: 'var(--dsw-color-success-fg,#1a7f37)' }}>{`${zh.running} v${st.version ?? '?'}${st.pid ? ' · PID ' + st.pid : ''}`}</span>
              : <span style={{ borderRadius: '999px', padding: '2px 10px', fontSize: '12px', fontWeight: 600, background: 'var(--dsw-color-danger-bg,#ffebe9)', color: 'var(--dsw-color-danger-fg,#cf222e)' }}>{zh.stopped}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button type="button" className="dsw-button dsw-button--primary" disabled={busy !== '' || running} onClick={() => { void doStart() }}>
            {busy === 'start' ? zh.starting : zh.btnStart}
          </button>
          <button type="button" className="dsw-button" disabled={busy !== '' || !running} onClick={() => { void doStop() }}>
            {busy === 'stop' ? zh.stopping : zh.btnStop}
          </button>
        </div>
        {msg ? <div style={{ fontSize: '12px', color: 'var(--dsw-color-text-secondary,#57606a)' }}>{msg}</div> : null}
      </div>
      {running ? (
        <div style={{ border: '1px solid var(--dsw-color-border-strong,#d0d7de)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{zh.savingsTitle}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--dsw-color-text-secondary,#57606a)' }}>{zh.totalRequests}</span>
            <b>{fmtTok(sv.requests)}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--dsw-color-text-secondary,#57606a)' }}>{zh.cacheSaved}</span>
            <b>{fmtUsd(sv.cache_savings_usd)}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--dsw-color-text-secondary,#57606a)' }}>{zh.compressSaved}</span>
            <b>{fmtUsd(sv.compression_savings_usd)}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--dsw-color-text-secondary,#57606a)' }}>
            <span>{zh.compressTokens}</span>
            <span>{fmtTok(sv.tokens_saved)}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Slot inject face shared by both suite panels. */
export interface SuiteSlotInject {
  /** Route-panel copy binder (bound in index.ts). */
  tRoute: (key: string) => string
}

export { zh as managerLocale }
