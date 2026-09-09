/**
 * Expected-upstream resolution (期望上游决议) — the single pure decision
 * function the spec (issue #1) prescribes. The
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
 * process, identical for both upstream kinds. Single definition — both spawn
 * entries consume it through buildProxySpawnPlan (src/spawn.ts, issue #5);
 * the former HEADROOM_ENV copy in src/paths.ts is gone.
 *  - DETECT_BACKEND: avoid the Windows detect_content_type deadlock.
 *  - TOOL_SEARCH: DeepSeek does not know the Anthropic tool_search type.
 *  - DISABLE_KOMPRESS: the Kompress ONNX model (chopratejas/kompress-base)
 *    never completed downloading on the author's machine (HF cache holds a
 *    0-byte .incomplete blob); proxy startup hangs forever in "Pre-loading
 *    compressors and parsers..." trying to fetch it. Skip Kompress so the
 *    proxy binds the port; TEXT/CODE compression still works. Remove once the
 *    model is cached (set HF_ENDPOINT=https://hf-mirror.com and start without
 *    this flag).
 */
export const HEADROOM_ENV_PRESET: Readonly<Record<string, string>> = {
  HEADROOM_DETECT_BACKEND: 'python',
  HEADROOM_TOOL_SEARCH: 'off',
  HEADROOM_DISABLE_KOMPRESS: '1',
}

/**
 * The resolution result: everything a spawn site needs to launch the proxy.
 * Discriminated on {@link UpstreamKind}: whether the Anthropic route is
 * enabled is encoded by the kind itself (official = enabled with the DeepSeek
 * Anthropic endpoint; third-party = disabled — third-party upstreams serve
 * OpenAI protocol only), so an "enabled but URL-less" upstream is
 * unrepresentable by construction. Read the flag through
 * {@link anthropicEnabled}.
 */
export type ExpectedUpstream = {
  readonly kind: 'official'
  /** Value for the engine's `--openai-api-url`. */
  readonly openaiApiUrl: string
  /** Value for the engine's `--anthropic-api-url`. */
  readonly anthropicApiUrl: string
  /** 环境预设组 — shared env preset for the proxy process. */
  readonly envPreset: Readonly<Record<string, string>>
} | {
  readonly kind: 'third-party'
  /** Value for the engine's `--openai-api-url`. */
  readonly openaiApiUrl: string
  /** 环境预设组 — shared env preset for the proxy process. */
  readonly envPreset: Readonly<Record<string, string>>
}

/** Whether the resolved upstream also serves the Anthropic route (是否启用 anthropic 上游). */
export function anthropicEnabled(upstream: ExpectedUpstream): boolean {
  return upstream.kind === 'official'
}

const OFFICIAL_UPSTREAM: ExpectedUpstream = {
  kind: 'official',
  openaiApiUrl: DEEPSEEK_OPENAI_URL,
  anthropicApiUrl: DEEPSEEK_ANTHROPIC_URL,
  envPreset: HEADROOM_ENV_PRESET,
}

function thirdPartyUpstream(openaiApiUrl: string): ExpectedUpstream {
  return {
    kind: 'third-party',
    openaiApiUrl,
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
 * priority of the spec (issue #1):
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
