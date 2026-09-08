/**
 * Shared proxy spawn plan (共享参数构造器): the single place that turns an
 * ExpectedUpstream (src/upstream.ts) into the exact argv + env for
 * `headroom proxy`. Both launch entries — startProxy() in src/index.ts and
 * POST /headroom-mgr/start in src/routes.ts — resolve the expected upstream
 * at the start instant and hand it here, so the two can no longer drift
 * (issue #5).
 *
 * Also home of readSettingsBaseURL(), the shared read of the one settings
 * field the resolution consumes (`llm-deepseek.baseURL`).
 *
 * Host half only: imports ./paths.ts (node:os/path), so the browser bundle
 * (which imports only ./constants.ts) must never reach this module.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only import: pulls in the @deepseek-ai/dsh-settings ambient
// declarations (ctx.settings.get) without a runtime dependency.
import type {} from '@deepseek-ai/dsh-settings'
import { HEADROOM_PORT, LLM_DEEPSEEK_NAMESPACE } from './constants.ts'
import { proxyLogPath } from './paths.ts'
import type { ExpectedUpstream, UpstreamKind } from './upstream.ts'

/**
 * Unreachable local placeholder for `--anthropic-api-url` on third-party
 * upstreams. Forensics (issue #4, headroom-ai 0.37.0): with the flag omitted
 * the engine defaults the Anthropic route to the REAL
 * https://api.anthropic.com — it even probes it from /readyz — so a
 * third-party start must explicitly pin the route to a port that refuses
 * locally (`/v1/messages` fails with a local 502) instead of letting
 * Anthropic-protocol requests egress anywhere.
 */
export const ANTHROPIC_DISABLED_URL = 'http://127.0.0.1:9'

/** Serializable resolution summary returned with start responses and logs. */
export interface UpstreamSummary {
  readonly kind: UpstreamKind
  readonly openaiApiUrl: string
  /**
   * The exact `--anthropic-api-url` argv value: the DeepSeek endpoint on the
   * official route, the unreachable {@link ANTHROPIC_DISABLED_URL} placeholder
   * when third-party.
   */
  readonly anthropicApiUrl: string
}

/** Everything a launch entry needs to spawn the proxy. */
export interface ProxySpawnPlan {
  /** argv for the headroom executable, starting with the `proxy` subcommand. */
  readonly args: readonly string[]
  /** Full process env for the spawn (inherits process.env + the preset). */
  readonly env: NodeJS.ProcessEnv
  readonly upstream: UpstreamSummary
}

/** Read the current `llm-deepseek` resolved section's baseURL. */
export function readSettingsBaseURL(ctx: Context): string | undefined {
  const section = ctx.settings.get(LLM_DEEPSEEK_NAMESPACE) as { baseURL?: unknown } | undefined
  return typeof section?.baseURL === 'string' ? section.baseURL : undefined
}

/**
 * Build the spawn argv + env for a resolved upstream. The official branch is
 * byte-for-byte the argv both entries used to assemble by hand before #5;
 * the third-party branch swaps the OpenAI upstream for the resolved
 * third-party address and pins the Anthropic route to
 * {@link ANTHROPIC_DISABLED_URL} (issue #4 conclusion).
 */
export function buildProxySpawnPlan(
  upstream: ExpectedUpstream,
  logFile: string = proxyLogPath(),
): ProxySpawnPlan {
  let anthropicTarget: string
  if (upstream.anthropicEnabled) {
    if (upstream.anthropicApiUrl === undefined) {
      // Resolver contract says enabled ⇒ defined; hitting this means a
      // resolver bug. Fail loudly — silently substituting the placeholder
      // would quietly disable the official Anthropic route.
      throw new Error('resolved upstream enables anthropic but carries no anthropic URL')
    }
    anthropicTarget = upstream.anthropicApiUrl
  } else {
    // The engine's flag beats the env fallback (ANTHROPIC_TARGET_API_URL),
    // so this argv value alone decides where the Anthropic route goes.
    anthropicTarget = ANTHROPIC_DISABLED_URL
  }
  const args = [
    'proxy',
    '--port', String(HEADROOM_PORT),
    '--anthropic-api-url', anthropicTarget,
    '--openai-api-url', upstream.openaiApiUrl,
    '--host', '127.0.0.1',
    '--connect-timeout-seconds', '15',
    '--request-timeout-seconds', '120',
    '--log-file', logFile,
  ]
  return {
    args,
    env: { ...process.env, ...upstream.envPreset },
    upstream: {
      kind: upstream.kind,
      openaiApiUrl: upstream.openaiApiUrl,
      anthropicApiUrl: anthropicTarget,
    },
  }
}

/** Human-readable one-liner of a resolved upstream (command text and the
 * startup log share this one formatter so the two cannot drift). */
export function formatUpstream(u: UpstreamSummary): string {
  return `upstream=${u.kind} openai=${u.openaiApiUrl} anthropic=${u.anthropicApiUrl}`
}

/** One startup.log record: timestamp + pid + the resolved upstream. */
export function startupLogLine(plan: ProxySpawnPlan, pid: number | undefined): string {
  return `${new Date().toISOString()} spawned headroom proxy pid=${pid ?? '?'} ${formatUpstream(plan.upstream)}\n`
}
