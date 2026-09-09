/**
 * Shared constants for the dsh-headroom plugin. Kept in a dedicated module so
 * the browser bundle can import the route values without dragging the host
 * half (node: imports) into the client graph.
 */

/** Plugin identity (also the settings namespace for plugin-owned config). */
export const PLUGIN_NAME = 'dsh-headroom'

/** Headroom proxy port and the DeepSeek upstream it forwards to. */
export const HEADROOM_PORT = 8787
export const DEEPSEEK_ANTHROPIC_URL = 'https://api.deepseek.com/anthropic'
export const DEEPSEEK_OPENAI_URL = 'https://api.deepseek.com'

/** The headroom baseURL the plugin writes into `llm-deepseek` settings. */
export const HEADROOM_BASE_URL = `http://127.0.0.1:${HEADROOM_PORT}/v1`

/** The DeepSeek public endpoint used when no base URL override is set. */
export const DIRECT_BASE_URL = 'https://api.deepseek.com'

/** The settings namespace whose `baseURL` field selects the route. */
export const LLM_DEEPSEEK_NAMESPACE = 'llm-deepseek'

/** Headroom health-check endpoint. */
export const HEADROOM_LIVEZ_URL = `http://127.0.0.1:${HEADROOM_PORT}/livez`

/**
 * Host webServer route paths. One definition imported by both the host
 * registration and the browser fetches, so the two halves cannot drift.
 */
export const MGR_STATUS_PATH = '/headroom-mgr/status'
export const MGR_ROUTE_PATH = '/headroom-mgr/route'
export const MGR_START_PATH = '/headroom-mgr/start'
export const MGR_STOP_PATH = '/headroom-mgr/stop'

/**
 * Official-endpoint spellings that all select the direct route. Deliberately
 * string-list based (no URL parsing) so the client bundle stays dependency-free.
 */
const DIRECT_ROUTE_VALUES: readonly string[] = [
  DIRECT_BASE_URL,
  `${DIRECT_BASE_URL}/`,
  `${DIRECT_BASE_URL}/v1`,
  `${DIRECT_BASE_URL}/v1/`,
  DEEPSEEK_ANTHROPIC_URL,
  `${DEEPSEEK_ANTHROPIC_URL}/`,
]

/** Which route a `llm-deepseek.baseURL` value selects. */
export type RouteKind = 'direct' | 'headroom' | 'third-party'

/**
 * Classify a baseURL value. blank/undefined means the composition default
 * (direct); official DeepSeek spellings — with or without /v1, the Anthropic
 * path, or a trailing slash, whitespace-tolerant — also count as direct; the
 * Headroom local proxy is `headroom`; every other value is third-party.
 */
export function routeOf(baseURL: string | undefined): RouteKind {
  const value = baseURL?.trim()
  if (value === undefined || value.length === 0) return 'direct'
  if (value === HEADROOM_BASE_URL) return 'headroom'
  if (DIRECT_ROUTE_VALUES.includes(value)) return 'direct'
  return 'third-party'
}

/**
 * True when a value selects the third-party route per the shared
 * {@link routeOf} — pure route classification, no scheme check: any value
 * that is neither blank, an official spelling nor the Headroom proxy counts
 * (e.g. when preserving the user's current value to the saved file). When
 * the value will actually become an upstream, or is untrusted user input,
 * require {@link isUsableThirdPartyBaseURL} instead.
 */
export function isThirdPartyBaseURL(baseURL: unknown): baseURL is string {
  return typeof baseURL === 'string' && routeOf(baseURL) === 'third-party'
}

/**
 * True when a value may be written as a third-party baseURL: it must carry an
 * http(s) scheme and classify as third-party (not official, not Headroom).
 */
export function isUsableThirdPartyBaseURL(baseURL: string): boolean {
  return /^https?:\/\//i.test(baseURL) && routeOf(baseURL) === 'third-party'
}
