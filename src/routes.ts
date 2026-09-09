/**
 * dsh-headroom-suite HTTP routes (merged from dsh-headroom-manager): the
 * browser half's data plane.
 *
 * WHY CUSTOM ROUTES (same escape hatch as dsh-caveman / dsh-market):
 * The dsh API gateway only serves allowlisted settings namespaces to the
 * browser, and the route-switch panel deliberately does NOT manage the proxy
 * process. These routes fill that gap with plain HTTP on the host webServer:
 *
 *   GET  /headroom-mgr/status  — probe /livez + read savings stats + PID
 *   POST /headroom-mgr/start   — spawn headroom.exe detached (survives dsh)
 *   POST /headroom-mgr/stop    — kill the process listening on :8787
 *   POST /headroom-mgr/route   — switch direct/headroom/third-party,
 *                                preserving any third-party baseURL in a
 *                                sidecar file
 *
 * All writes check same-origin (Origin header must match Host) so a cross-site
 * page cannot start or kill processes through the user's browser (CSRF).
 */
import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Empty type-only import: pulls in the @deepseek-ai/dsh-settings ambient
// declarations (ctx.settings.get/mutate) without a runtime dependency.
import type {} from '@deepseek-ai/dsh-settings'
import {
  HEADROOM_BASE_URL,
  HEADROOM_LIVEZ_URL,
  HEADROOM_PORT,
  isThirdPartyBaseURL,
  isUsableThirdPartyBaseURL,
  LLM_DEEPSEEK_NAMESPACE,
  MGR_ROUTE_PATH,
  MGR_START_PATH,
  MGR_STATUS_PATH,
  MGR_STOP_PATH,
} from './constants.ts'
import {
  deleteSavedBaseURL,
  readSavedBaseURL,
  venvHeadroom,
  writeSavedBaseURL,
} from './paths.ts'
import { buildProxySpawnPlan, readSettingsBaseURL, spawnDetachedAndLog } from './spawn.ts'
import { resolveExpectedUpstream } from './upstream.ts'

interface SavingsLifetime {
  requests?: number
  tokens_saved?: number
  compression_savings_usd?: number
  cache_savings_usd?: number
  cache_read_tokens?: number
  total_input_tokens?: number
}

/** True when the request originates from the served web app (Origin === Host). */
function sameOrigin(request: { headers: { origin?: string, host?: string } }): boolean {
  const origin = request.headers.origin
  const host = request.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

/** Shared write guard: POST method + same-origin (CSRF). Sends the error
 * response itself and returns false when the request must not proceed. */
function guardWrite(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'method not allowed; use POST' })
    return false
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: 'untrusted origin' })
    return false
  }
  return true
}

/** Cap so a runaway client cannot buffer unbounded memory; real bodies are <200B. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Collect a request body as UTF-8 text; rejects once past {@link MAX_BODY_BYTES}.
 * Does not destroy the socket on oversize — the caller still owes the client a
 * 400 response, and the server closes the connection after the reply.
 */
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`))
        return
      }
      chunks.push(c)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function fetchJson(url: string, timeoutMs = 3000): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const req = httpRequest(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          resolve(undefined)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(undefined)
    })
    req.on('error', () => resolve(undefined))
    req.end()
  })
}

/** Find the PID listening on HEADROOM_PORT via netstat; undefined when none. */
function findPortPid(): Promise<string | undefined> {
  return new Promise((resolve) => {
    exec(`netstat -ano`, { encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve(undefined)
      for (const line of stdout.split('\n')) {
        if (line.includes(`:${HEADROOM_PORT}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (/^\d+$/.test(pid)) return resolve(pid)
        }
      }
      resolve(undefined)
    })
  })
}

function killPid(pid: string): Promise<boolean> {
  return new Promise((resolve) => {
    // taskkill needs single-slash flags on win32; exec uses cmd so quoting is plain.
    exec(`taskkill /F /PID ${pid}`, (err) => resolve(!err))
  })
}

/**
 * Mount the three management routes.
 * @returns disposer removing all routes.
 */
export function mountManagerRoutes(ctx: Context): () => void {
  // Caller MUST acquire webServer via ctx.inject(['webServer'], ...) — a sync
  // ctx.get races plugin load order and silently skips mounting.
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    console.error('[dsh-headroom-suite] webServer absent — routes not mounted')
    return () => {}
  }

  async function status(): Promise<Record<string, unknown>> {
    const livez = await fetchJson(HEADROOM_LIVEZ_URL) as { version?: string } | undefined
    const running = livez !== undefined
    let pid: string | undefined
    if (running) pid = await findPortPid()
    let savings: SavingsLifetime | undefined
    if (running) {
      const history = await fetchJson(`http://127.0.0.1:${HEADROOM_PORT}/stats-history`) as
        | { lifetime?: SavingsLifetime }
        | undefined
      savings = history?.lifetime
    }
    return {
      running,
      version: livez?.version,
      pid,
      exe: venvHeadroom(),
      port: HEADROOM_PORT,
      savings: savings ?? null,
      savedBaseURL: readSavedBaseURL() ?? null,
    }
  }

  /**
   * Apply a route switch (runs serialized by the caller). Returns the HTTP
   * status + body; throws on unexpected failures (caller maps them to 500).
   */
  async function applyRoute(body: { target?: unknown; baseURL?: unknown }): Promise<{ status: number; body: Record<string, unknown> }> {
    const target = body.target
    if (target !== 'direct' && target !== 'headroom' && target !== 'third-party') {
      return { status: 400, body: { error: 'target must be "direct", "headroom" or "third-party"' } }
    }
    if (target === 'headroom') {
      const current = readSettingsBaseURL(ctx)
      const saved = isThirdPartyBaseURL(current) ? current : undefined
      const prevSaved = readSavedBaseURL()
      let staleCleanupFailed = false
      if (saved !== undefined) writeSavedBaseURL(saved)
      else staleCleanupFailed = !deleteSavedBaseURL() // nothing third-party to keep — drop any stale sidecar
      try {
        await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: 'set', path: ['baseURL'], value: HEADROOM_BASE_URL }])
      } catch (error) {
        // Roll back the sidecar so a failed switch does not orphan the save.
        if (prevSaved !== undefined) writeSavedBaseURL(prevSaved)
        else deleteSavedBaseURL()
        throw error
      }
      return { status: 200, body: { ok: true, savedBaseURL: saved ?? null, sidecarCleanupFailed: staleCleanupFailed } }
    }
    if (target === 'third-party') {
      const requested = typeof body.baseURL === 'string' ? body.baseURL.trim() : ''
      if (!isUsableThirdPartyBaseURL(requested)) {
        return { status: 400, body: { error: 'baseURL must be a third-party http(s) endpoint' } }
      }
      await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: 'set', path: ['baseURL'], value: requested }])
      // The user replaced the live third-party value; drop any sidecar so a
      // later direct switch lands on the official default, not a stale URL.
      const removed = deleteSavedBaseURL()
      return { status: 200, body: { ok: true, baseURL: requested, sidecarCleanupFailed: !removed } }
    }
    // target === 'direct'
    const saved = readSavedBaseURL()
    if (saved !== undefined) {
      await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: 'set', path: ['baseURL'], value: saved }])
      const removed = deleteSavedBaseURL()
      // Report cleanup failure instead of swallowing it: a stale sidecar would
      // re-apply an old baseURL on the next direct switch.
      return { status: 200, body: { ok: true, restoredBaseURL: saved, sidecarCleanupFailed: !removed } }
    }
    await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: 'unset', path: ['baseURL'] }])
    return { status: 200, body: { ok: true, restoredBaseURL: null } }
  }

  // Serialize route mutations: the sidecar is a read-modify-write file while
  // settings.mutate is async, so interleaved POSTs could lose a save.
  let routeQueue: Promise<unknown> = Promise.resolve()

  const disposers = [
    webServer.register({
      kind: 'exact',
      path: MGR_STATUS_PATH,
      handler: (_request: IncomingMessage, response: ServerResponse) => {
        void status().then((s) => sendJson(response, 200, s))
      },
    }),
    webServer.register({
      kind: 'exact',
      path: MGR_ROUTE_PATH,
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (!guardWrite(request, response)) return
        let parsed: { target?: unknown; baseURL?: unknown }
        try {
          parsed = JSON.parse(await readBody(request)) as { target?: unknown; baseURL?: unknown }
        } catch {
          sendJson(response, 400, { error: 'invalid JSON body' })
          return
        }
        const outcome = routeQueue.then(() => applyRoute(parsed))
        routeQueue = outcome.catch(() => {})
        try {
          const result = await outcome
          sendJson(response, result.status, result.body)
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),
    webServer.register({
      kind: 'exact',
      path: MGR_START_PATH,
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (!guardWrite(request, response)) return
        const already = await fetchJson(HEADROOM_LIVEZ_URL)
        if (already !== undefined) {
          sendJson(response, 200, { ok: true, alreadyRunning: true })
          return
        }
        try {
          // Target: the plugin-venv headroom.exe with the spawn plan built by
          // the shared constructor (src/spawn.ts) from the upstream resolved
          // at this start instant — the same resolution + plan as startProxy()
          // (src/index.ts). Two earlier launch strategies failed:
          //  - `%USERPROFILE%\.headroom\start-headroom.vbs` was a leftover from
          //    the author's machine and never exists on fresh installs.
          //  - `cmd /c start "" wscript/exe...` creates the process but it hangs
          //    before binding the port in the dsh host's non-interactive session
          //    (console creation under `start` never completes). A plain
          //    detached spawn with stdio ignored starts fine.
          // Trade-off: a plain detached child dies with the dsh host process
          // tree (Windows job object semantics) — restart the proxy after a
          // host crash.
          if (!existsSync(venvHeadroom())) {
            sendJson(response, 409, { ok: false, error: 'headroom not installed; run /headroom-install' })
            return
          }
          const plan = buildProxySpawnPlan(
            resolveExpectedUpstream(readSettingsBaseURL(ctx), readSavedBaseURL()),
          )
          spawnDetachedAndLog(plan)
          // give the proxy a moment to bind before reporting: cold start loads
          // transformers/tokenizers from a cold venv (~50-90s on this machine,
          // measured); poll up to 120s before reporting not-ready.
          const deadline = Date.now() + 120000
          let live: unknown = undefined
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 1500))
            live = await fetchJson(HEADROOM_LIVEZ_URL)
            if (live !== undefined) break
          }
          sendJson(response, 200, {
            ok: true,
            healthyAfterStart: live !== undefined,
            upstream: plan.upstream,
          })
        } catch (err) {
          sendJson(response, 500, { error: String(err) })
        }
      },
    }),
    webServer.register({
      kind: 'exact',
      path: MGR_STOP_PATH,
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (!guardWrite(request, response)) return
        const pid = await findPortPid()
        if (pid === undefined) {
          sendJson(response, 200, { ok: true, wasRunning: false })
          return
        }
        const killed = await killPid(pid)
        sendJson(response, killed ? 200 : 500, {
          ok: killed,
          stoppedPid: killed ? pid : undefined,
        })
      },
    }),
  ]

  return () => {
    for (const dispose of disposers) dispose()
  }
}
