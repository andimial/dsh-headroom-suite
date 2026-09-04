/**
 * dsh-headroom browser half: the "线路切换" settings section.
 *
 * Presents the Headroom compression route as a control panel:
 *  - current route (direct / compressed / third-party) from the `llm-deepseek`
 *    settings namespace
 *  - Headroom health (probed in-browser; the proxy answers loopback CORS)
 *  - one-click route toggle and third-party baseURL entry, both via the
 *    POST /headroom-mgr/route host route
 *
 * The heavy lifecycle actions (install / start / stop) are orchestrated by the
 * host half; the UI surfaces their outcomes through the settings snapshot and
 * the health probe. This panel is an integration surface only — the
 * compression engine is Headroom (see NOTICE).
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { HEADROOM_LIVEZ_URL, isUsableThirdPartyBaseURL, MGR_ROUTE_PATH, MGR_STATUS_PATH, routeOf } from '../constants.ts'
import { EMPTY_STATS, fetchHeadroomStats, formatTokens } from './stats.ts'
import type { HeadroomStatsView } from './stats.ts'
import type { en } from './locales.ts'
import styles from './HeadroomPanel.css.ts'

/** The narrowed `llm-deepseek` section this page reads and writes. */
export interface DeepSeekRouteSettings {
  /** The configured endpoint override; undefined means the composition default. */
  baseURL?: string
}

/** Injected dependencies of {@link HeadroomPanel}. */
export interface HeadroomPanelInjected {
  /** Hot-reloaded `llm-deepseek` namespace scope. */
  scope: SettingsScope<DeepSeekRouteSettings>
  /** Panel copy. */
  t: (key: keyof typeof en) => string
  /** Execute a host command (e.g. '/headroom start') and return its result. */
  runCommand: (line: string) => Promise<{ kind: 'success' | 'error'; text: string }>
}

/** Props delivered by the slot outlet (inject face spread flat). */
export type HeadroomPanelProps = Partial<HeadroomPanelInjected>

/** Headroom health probe outcome. */
type ProbeState =
  | { kind: 'idle' }
  | { kind: 'probing' }
  | { kind: 'healthy'; version: string }
  | { kind: 'down' }

/** Body of the POST /headroom-mgr/route reply (only the fields this panel reads). */
interface RouteResponse {
  ok?: boolean
  error?: string
  savedBaseURL?: string | null
  restoredBaseURL?: string | null
  sidecarCleanupFailed?: boolean
  baseURL?: string
}

/**
 * Probe Headroom `/livez` once. The proxy answers the loopback origin's CORS
 * preflight, so a plain fetch is sufficient; a timeout or network failure
 * means the route is down.
 * @returns the probe outcome.
 */
async function probeHeadroom(): Promise<Exclude<ProbeState, { kind: 'idle' | 'probing' }>> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
      const response = await fetch(HEADROOM_LIVEZ_URL, { signal: controller.signal })
      if (!response.ok) return { kind: 'down' }
      const body = (await response.json()) as { version?: string }
      return { kind: 'healthy', version: typeof body.version === 'string' ? body.version : '?' }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { kind: 'down' }
  }
}

/** POST a route-switch payload; returns the HTTP status and parsed reply. */
async function postRoute(payload: Record<string, unknown>): Promise<{ status: number; body: RouteResponse }> {
  const response = await fetch(MGR_ROUTE_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const body = await response.json() as RouteResponse
  return { status: response.status, body }
}

/**
 * Render the Headroom control panel: current route, proxy health, route
 * toggle, and the safety notes. The host half owns the actual writes; the
 * panel re-renders from the next snapshot.
 * @param props - the inject face (scope, snapshot hook, copy).
 * @returns the panel content.
 */
export function HeadroomPanel(props: HeadroomPanelProps): ReactNode {
  const { scope, t } = props
  if (scope === undefined || t === undefined) return null
  // Body owns every hook so none of them sit behind a conditional return.
  return <HeadroomPanelBody scope={scope} t={t} runCommand={props.runCommand} />
}

/** Body props: scope/t are guaranteed here; runCommand stays optional. */
type HeadroomPanelBodyProps = Omit<HeadroomPanelInjected, 'runCommand'> & {
  runCommand?: HeadroomPanelInjected['runCommand']
}

function HeadroomPanelBody(props: HeadroomPanelBodyProps): ReactNode {
  const { scope, t, runCommand } = props
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const ready = snapshot.status === 'ready'
  const baseURL = ready ? snapshot.value?.baseURL : undefined
  const writable = ready && snapshot.writable === true
  const route = routeOf(baseURL)
  const [probe, setProbe] = useState<ProbeState>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [opBusy, setOpBusy] = useState<string | null>(null)
  const [opResult, setOpResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [stats, setStats] = useState<HeadroomStatsView>(EMPTY_STATS)
  const [savedBaseURL, setSavedBaseURL] = useState<string | null>(null)
  const [customURL, setCustomURL] = useState('')

  useEffect(() => {
    if (!ready || route !== 'headroom' || probe.kind !== 'idle') return
    setProbe({ kind: 'probing' })
    void probeHeadroom().then(setProbe)
  }, [ready, route, probe.kind])

  // Read the saved third-party baseURL (if any) once on mount so the panel can
  // show what switching back to direct will restore.
  useEffect(() => {
    fetch(MGR_STATUS_PATH, { cache: 'no-store' })
      .then((r) => r.json())
      .then((b: { savedBaseURL?: unknown }) => {
        setSavedBaseURL(typeof b.savedBaseURL === 'string' ? b.savedBaseURL : null)
      })
      .catch(() => {})
  }, [])

  // Live stats: poll Headroom /stats every 10s while the panel is mounted.
  useEffect(() => {
    let alive = true
    const refresh = async (): Promise<void> => {
      const next = await fetchHeadroomStats()
      if (alive) setStats(next)
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 10_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  // Keep the third-party input in sync with reality: the live value while on
  // the third-party route, otherwise the URL a direct switch would restore.
  useEffect(() => {
    setCustomURL(route === 'third-party' ? baseURL ?? '' : savedBaseURL ?? '')
  }, [route, baseURL, savedBaseURL])

  if (!ready) return null

  const switchRoute = async (target: 'direct' | 'headroom'): Promise<void> => {
    if (!writable) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const { status, body } = await postRoute({ target })
      if (status < 200 || status >= 300 || body.ok !== true) throw new Error(body.error ?? `HTTP ${status}`)
      if (target === 'headroom') {
        // A successful headroom switch keeps the saved third-party baseURL.
        setSavedBaseURL(body.savedBaseURL ?? null)
      } else if (body.sidecarCleanupFailed === true && typeof body.restoredBaseURL === 'string') {
        // Direct switch worked but the sidecar survived — keep showing the
        // stale URL the next direct switch would (re)apply.
        setSavedBaseURL(body.restoredBaseURL)
      } else {
        setSavedBaseURL(null)
      }
      setDone(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const applyThirdParty = async (): Promise<void> => {
    if (!writable) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const { status, body } = await postRoute({ target: 'third-party', baseURL: customURL.trim() })
      if (status < 200 || status >= 300 || body.ok !== true) throw new Error(body.error ?? `HTTP ${status}`)
      setDone(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  const runLifecycle = async (command: string, label: string): Promise<void> => {
    if (runCommand === undefined) return
    setOpBusy(label)
    setOpResult(null)
    try {
      const result = await runCommand(command)
      setOpResult(result)
      // Refresh the health probe after start/stop so the badge reflects reality.
      setProbe({ kind: 'probing' })
      void probeHeadroom().then(setProbe)
    } catch (failure) {
      setOpResult({ kind: 'error', text: failure instanceof Error ? failure.message : String(failure) })
    } finally {
      setOpBusy(null)
    }
  }

  // NOTE: proxy process start/stop buttons were removed from this panel.
  // Process lifecycle is owned by the dsh-headroom-manager plugin ("代理管理"
  // settings section); this panel keeps only engine install + route switching
  // + token stats to avoid two competing sets of start/stop controls.

  const routeLabel = route === 'direct' ? t('routeDirect')
    : route === 'headroom' ? t('routeHeadroom')
      : t('routeThirdParty')
  const customValid = isUsableThirdPartyBaseURL(customURL.trim())

  return (
    <section className={styles['section']} aria-label={t('title')}>
      <div className={styles['statsCard']}>
        <div className={styles['statsTitle']}>{t('statsTitle')}</div>
        {route === 'direct'
          ? <div className={styles['statsWarn']}>{t('statsFrozenDirect')}</div>
          : null}
        <div className={styles['statsGrid']}>
          <div className={styles['statCell']}>
            <span className={styles['statValue']}>{formatTokens(stats.inputTokens)}</span>
            <span className={styles['statLabel']}>{t('stat60min')}</span>
          </div>
          <div className={styles['statCell']}>
            <span className={styles['statValue']}>{formatTokens(stats.tokensSaved)}</span>
            <span className={styles['statLabel']}>{t('statSavedTotal')}</span>
          </div>
          <div className={styles['statCell']}>
            <span className={styles['statValue']}>{formatTokens(stats.lifetimeInputTokens)}</span>
            <span className={styles['statLabel']}>{t('statLifetimeInput')}</span>
          </div>
          <div className={styles['statCell']}>
            <span className={styles['statValue']}>{stats.cacheHitRate > 0 ? `${stats.cacheHitRate.toFixed(1)}%` : '—'}</span>
            <span className={styles['statLabel']}>{t('statCacheHit')}</span>
          </div>
          <div className={styles['statCell']}>
            <span className={styles['statValue']}>{stats.requests > 0 ? String(stats.requests) : '—'}</span>
            <span className={styles['statLabel']}>{t('statRequests')}</span>
          </div>
        </div>

        {stats.ok
          ? <span className={styles['statsNote']}>{t('statsNote')}</span>
          : <span className={styles['statsWarn']}>{t('statsUnavailable')}</span>}
      </div>
      <div className={styles['card']}>
        <div className={styles['row']}>
          <span className={styles['label']}>{t('current')}</span>
          <span className={styles['value']}>{routeLabel}</span>
        </div>
        {route === 'headroom' && savedBaseURL !== null
          ? <div className={styles['row']}>
            <span className={styles['value']}>{t('savedThirdParty').replace('{url}', savedBaseURL)}</span>
          </div>
          : null}
        <div className={styles['row']}>
          <span className={styles['label']}>{t('thirdPartyLabel')}</span>
        </div>
        <div className={styles['actions']}>
          <input
            type="text"
            className={styles['input']}
            value={customURL}
            placeholder={t('thirdPartyPlaceholder')}
            disabled={busy || !writable}
            onChange={(e) => { setCustomURL(e.target.value) }}
          />
          <button
            type="button"
            className="dsw-button"
            disabled={busy || !writable || !customValid}
            onClick={() => { void applyThirdParty() }}
          >
            {t('applyThirdParty')}
          </button>
        </div>
        <div className={styles['statsNote']}>{t('thirdPartyHint')}</div>
        <div className={styles['row']}>
          <span className={styles['label']}>{t('headroomStatus')}</span>
          {probe.kind === 'healthy'
            ? <span className={`${styles['badge']} ${styles['badgeHealthy']}`}>{t('headroomHealthy').replace('{version}', probe.version)}</span>
            : probe.kind === 'down'
              ? <span className={`${styles['badge']} ${styles['badgeDown']}`}>{t('headroomDown')}</span>
              : <span className={`${styles['badge']} ${styles['badgeProbing']}`}>{t('headroomProbing')}</span>}
        </div>
        {probe.kind === 'down' && route === 'headroom'
          ? <div className={styles['warning']}>{t('headroomDownWarning')}</div>
          : null}
        <div className={styles['actions']}>
          <button
            type="button"
            className="dsw-button dsw-button--primary"
            disabled={busy || !writable || route === 'headroom'}
            onClick={() => { void switchRoute('headroom') }}
          >
            {busy && route !== 'headroom' ? t('switching') : t('switchToHeadroom')}
          </button>
          <button
            type="button"
            className="dsw-button"
            disabled={busy || !writable || route === 'direct'}
            onClick={() => { void switchRoute('direct') }}
          >
            {busy && route !== 'direct' ? t('switching') : t('switchToDirect')}
          </button>
        </div>
        {done ? <div className={styles['row']}><span className={styles['value']}>{t('switched')}</span></div> : null}
        {error !== null ? <div className={styles['warning']}>{t('error').replace('{message}', error)}</div> : null}
      </div>
      <div className={styles['card']}>
        <div className={styles['row']}>
          <span className={styles['label']}>{t('lifecycle')}</span>
        </div>
        <div className={styles['actions']}>
          {/* start/stop removed — owned by dsh-headroom-manager ("代理管理") */}
          <button
            type="button"
            className="dsw-button"
            disabled={opBusy !== null}
            onClick={() => { void runLifecycle('/headroom-install', t('installing')) }}
          >
            {opBusy === t('installing') ? t('installing') : t('install')}
          </button>
        </div>
        {opResult !== null
          ? <div className={opResult.kind === 'error' ? styles['warning'] : styles['row']}>
            <span className={styles['value']}>{opResult.text}</span>
          </div>
          : null}
        {opBusy !== null ? <div className={styles['row']}><span className={styles['value']}>{opBusy}</span></div> : null}
      </div>
      <div className={styles['notes']}>
        <span className={styles['notesTitle']}>{t('notes')}</span>
        <span>• {t('noteSource')}</span>
        <span>• {t('noteCache')}</span>
        <span>• {t('noteQuality')}</span>
        <span>• {t('noteFallback')}</span>
      </div>
    </section>
  )
}
