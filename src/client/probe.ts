/**
 * Headroom health probe + watch (browser half).
 *
 * WHY NOT `/livez` DIRECTLY: the panel used to fetch `http://127.0.0.1:8787/livez`
 * from the page. That only works when the page itself is served from a loopback
 * http origin. The Desktop composition runs its renderer on `dsh-app://app`, and
 * Headroom's CORS policy (`allow_origin_regex = https?://(localhost|127\.0\.0\.1|
 * \[::1\])(:\d+)?`) refuses that origin: the proxy answers 200 but withholds
 * `access-control-allow-origin`, Chromium blocks the response, and the panel reads
 * 「不可达」 no matter what the proxy does. Health therefore comes from the host
 * route {@link MGR_STATUS_PATH}, which probes loopback in Node (no CORS) and is
 * same-origin for the panel in every composition.
 *
 * WHY A WATCH: the probe used to be one-shot (`probe.kind === 'idle'`), so a single
 * failure — a proxy cold start preloading compressors for over two minutes, a
 * restart, a laptop resume — pinned the badge to 「不可达」 until the settings page
 * was remounted. Polling lets the badge recover on its own.
 */

import { MGR_STATUS_PATH } from '../constants.ts'

/** Health outcome of one probe. */
export type HeadroomProbeState = { kind: 'healthy'; version: string } | { kind: 'down' }

/** What a watch reports: the in-flight marker or a probe outcome. */
export type HeadroomWatchEvent = { kind: 'probing' } | HeadroomProbeState

/** How long one probe may take before it counts as down. */
const PROBE_TIMEOUT_MS = 3000

/** Default poll period of {@link startHeadroomWatch}. */
export const HEADROOM_WATCH_INTERVAL_MS = 10_000

/**
 * Probe Headroom health once through the host route. Any failure — transport,
 * non-2xx, malformed body — means down: the badge exists to answer "can the
 * next request reach the proxy", and "cannot tell" is not a yes.
 * @returns the probe outcome.
 */
export async function probeHeadroom(): Promise<HeadroomProbeState> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      const response = await fetch(MGR_STATUS_PATH, { signal: controller.signal, cache: 'no-store' })
      if (!response.ok) return { kind: 'down' }
      const body = (await response.json()) as { running?: boolean, version?: string }
      if (body.running !== true) return { kind: 'down' }
      return { kind: 'healthy', version: typeof body.version === 'string' ? body.version : '?' }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { kind: 'down' }
  }
}

/**
 * Watch Headroom health until the returned disposer runs: report `probing`, probe
 * immediately, then re-probe every `intervalMs`. One probe is in flight at a time,
 * so a slow host cannot pile requests up; a probe that resolves after disposal is
 * dropped instead of writing into an unmounted panel.
 *
 * @param probe - probe implementation (injected so tests need no fetch stub).
 * @param onChange - receives every state change, oldest first.
 * @param intervalMs - poll period.
 * @returns disposer stopping the watch.
 */
export function startHeadroomWatch(
  probe: () => Promise<HeadroomProbeState>,
  onChange: (event: HeadroomWatchEvent) => void,
  intervalMs = HEADROOM_WATCH_INTERVAL_MS,
): () => void {
  let alive = true
  let inFlight = false
  const tick = async (): Promise<void> => {
    if (!alive || inFlight) return
    inFlight = true
    try {
      const next = await probe()
      if (alive) onChange(next)
    } finally {
      inFlight = false
    }
  }
  onChange({ kind: 'probing' })
  void tick()
  const timer = setInterval(() => { void tick() }, intervalMs)
  return () => {
    alive = false
    clearInterval(timer)
  }
}
