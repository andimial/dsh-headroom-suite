/**
 * Expected-upstream resolution (期望上游决议) — the single pure decision
 * function from ADR-0001 (docs/adr/0001-upstream-derived-at-start.md). The
 * two proxy spawn entries (src/index.ts /headroom-start and src/routes.ts
 * /headroom-mgr/start) consume this one decision instead of hardcoding the
 * DeepSeek upstreams.
 *
 * Pure by contract: reads no files, reads no settings, performs no I/O. The
 * callers own every side effect and pass the raw `llm-deepseek` baseURL and
 * the raw saved-file content in as strings.
 *
 * Terms (CONTEXT.md): 期望上游 / 保存文件 / 第三方直发线路 / 第三方上游.
 */
import {
  DEEPSEEK_ANTHROPIC_URL,
  DEEPSEEK_OPENAI_URL,
  isUsableThirdPartyBaseURL,
  routeOf,
} from './constants.ts'

/** Which upstream a freshly started proxy forwards to (上游种类). */
export type UpstreamKind = 'official' | 'third-party'

/**
 * Shared environment preset group (环境预设组) handed to the spawned proxy
 * process, identical for both upstream kinds. Single definition — the spawn
 * sites and src/paths.ts drop their local copies in favour of this one when
 * they wire the resolver in (issue #5).
 */
export const HEADROOM_ENV_PRESET: Readonly<Record<string, string>> = {
  // avoid Windows detect_content_type deadlock
  HEADROOM_DETECT_BACKEND: 'python',
  // DeepSeek does not know the Anthropic tool_search type
  HEADROOM_TOOL_SEARCH: 'off',
  // Kompress ONNX model never finished downloading on the author's machine
  // (proxy hangs in pre-load); see routes.ts HEADROOM_ENV for the full note.
  HEADROOM_DISABLE_KOMPRESS: '1',
}

/** The resolution result: everything a spawn site needs to launch the proxy. */
export interface ExpectedUpstream {
  /** 上游种类 — DeepSeek official or a third-party address. */
  readonly kind: UpstreamKind
  /** Value for the engine's `--openai-api-url`. */
  readonly openaiApiUrl: string
  /** Whether the engine gets `--anthropic-api-url`; third-party upstreams serve OpenAI protocol only (no Claude Code). */
  readonly anthropicEnabled: boolean
  /** Value for `--anthropic-api-url`; defined iff {@link ExpectedUpstream.anthropicEnabled}. */
  readonly anthropicApiUrl: string | undefined
  /** 环境预设组 — shared env preset for the proxy process. */
  readonly envPreset: Readonly<Record<string, string>>
}

const OFFICIAL_UPSTREAM: ExpectedUpstream = {
  kind: 'official',
  openaiApiUrl: DEEPSEEK_OPENAI_URL,
  anthropicEnabled: true,
  anthropicApiUrl: DEEPSEEK_ANTHROPIC_URL,
  envPreset: HEADROOM_ENV_PRESET,
}

function thirdPartyUpstream(openaiApiUrl: string): ExpectedUpstream {
  return {
    kind: 'third-party',
    openaiApiUrl,
    anthropicEnabled: false,
    anthropicApiUrl: undefined,
    envPreset: HEADROOM_ENV_PRESET,
  }
}

/**
 * A saved-file (保存文件) content selects a third-party upstream only when it
 * carries an http(s) scheme AND classifies as third-party per the shared
 * `routeOf` — official DeepSeek spellings and the local proxy address never
 * count. Anything else (blank, garbage, official, the proxy itself) is
 * treated as absent: the caller falls through to the official upstream.
 */
function savedThirdPartyAddress(savedFileContent: string | undefined): string | undefined {
  const value = savedFileContent?.trim()
  if (value === undefined || value.length === 0) return undefined
  return isUsableThirdPartyBaseURL(value) ? value : undefined
}

/**
 * Resolve the expected upstream (期望上游) for a proxy start, in the fixed
 * priority of ADR-0001:
 *
 * 1. the current baseURL classifies as third-party (第三方直发线路) → that
 *    address is the third-party upstream;
 * 2. the current baseURL is on the headroom route (压缩线路) AND the saved
 *    file holds a usable third-party address → the saved address is the
 *    upstream;
 * 3. otherwise → the DeepSeek official upstream (OpenAI + Anthropic routes).
 *
 * Invalid saved-file content is treated as absent (rule 3), never thrown.
 * The derivation happens only at start time; a running proxy is never
 * re-targeted by the callers.
 *
 * @param currentBaseURL raw `llm-deepseek.baseURL` value (undefined = unset)
 * @param savedFileContent raw saved-file (保存文件) content (undefined = no file)
 */
export function resolveExpectedUpstream(
  currentBaseURL: string | undefined,
  savedFileContent: string | undefined,
): ExpectedUpstream {
  const current = currentBaseURL?.trim()
  const route = routeOf(current)
  if (current !== undefined && route === 'third-party') {
    return thirdPartyUpstream(current)
  }
  if (route === 'headroom') {
    const saved = savedThirdPartyAddress(savedFileContent)
    if (saved !== undefined) return thirdPartyUpstream(saved)
  }
  return OFFICIAL_UPSTREAM
}
