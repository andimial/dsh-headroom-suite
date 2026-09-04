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
 *
 * All writes check same-origin (Origin header must match Host) so a cross-site
 * page cannot start or kill processes through the user's browser (CSRF).
 */
import { spawn, exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { DEEPSEEK_ANTHROPIC_URL, DEEPSEEK_OPENAI_URL } from './constants.ts'

const HEADROOM_PORT = 8787
const LIVEZ_URL = `http://127.0.0.1:${HEADROOM_PORT}/livez`
/** Mirrors startProxy() env (src/index.ts) so the panel matches /headroom-start. */
const HEADROOM_ENV = {
  HEADROOM_DETECT_BACKEND: 'python',
  HEADROOM_TOOL_SEARCH: 'off',
  // The Kompress ONNX model (chopratejas/kompress-base) has never completed
  // downloading on this machine (HF cache holds a 0-byte .incomplete blob);
  // proxy startup hangs forever in "Pre-loading compressors and parsers..."
  // trying to fetch it. Skip Kompress so the proxy binds the port; TEXT/CODE
  // compression still works. Remove once the model is cached
  // (set HF_ENDPOINT=https://hf-mirror.com and start without this flag).
  HEADROOM_DISABLE_KOMPRESS: '1',
}
/** Plugin-managed venv (keep in sync with pluginHome()/venvHeadroom() in src/index.ts). */
const PLUGIN_HOME = join(homedir(), '.dsh-headroom')

/** The headroom.exe the plugin installs into its own venv. */
function venvHeadroomExe(): string {
  return process.platform === 'win32'
    ? join(PLUGIN_HOME, 'venv', 'Scripts', 'headroom.exe')
    : join(PLUGIN_HOME, 'venv', 'bin', 'headroom')
}

function proxyLogPath(): string {
  return join(PLUGIN_HOME, 'proxy.log')
}

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
    const livez = await fetchJson(LIVEZ_URL) as { version?: string } | undefined
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
      exe: venvHeadroomExe(),
      port: HEADROOM_PORT,
      savings: savings ?? null,
    }
  }

  const disposers = [
    webServer.register({
      kind: 'exact',
      path: '/headroom-mgr/status',
      handler: (_request: IncomingMessage, response: ServerResponse) => {
        void status().then((s) => sendJson(response, 200, s))
      },
    }),
    webServer.register({
      kind: 'exact',
      path: '/headroom-mgr/start',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'method not allowed; use POST' })
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
        const already = await fetchJson(LIVEZ_URL)
        if (already !== undefined) {
          sendJson(response, 200, { ok: true, alreadyRunning: true })
          return
        }
        try {
          // Target: the plugin-venv headroom.exe with the same args/env as
          // startProxy() (src/index.ts). Two earlier launch strategies failed:
          //  - `%USERPROFILE%\.headroom\start-headroom.vbs` was a leftover from
          //    the author's machine and never exists on fresh installs.
          //  - `cmd /c start "" wscript/exe...` creates the process but it hangs
          //    before binding the port in the dsh host's non-interactive session
          //    (console creation under `start` never completes). A plain
          //    detached spawn with stdio ignored starts fine.
          // Trade-off: a plain detached child dies with the dsh host process
          // tree (Windows job object semantics) — restart the proxy after a
          // host crash.
          const exe = venvHeadroomExe()
          if (!existsSync(exe)) {
            sendJson(response, 409, { ok: false, error: 'headroom not installed; run /headroom-install' })
            return
          }
          const startArgs = [
            'proxy',
            '--port', String(HEADROOM_PORT),
            '--anthropic-api-url', DEEPSEEK_ANTHROPIC_URL,
            '--openai-api-url', DEEPSEEK_OPENAI_URL,
            '--host', '127.0.0.1',
            '--connect-timeout-seconds', '15',
            '--request-timeout-seconds', '120',
            '--log-file', proxyLogPath(),
          ]
          const child = spawn(exe, startArgs, {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, ...HEADROOM_ENV },
          })
          child.unref()
          // give the proxy a moment to bind before reporting: cold start loads
          // transformers/tokenizers from a cold venv (~50-90s on this machine,
          // measured); poll up to 120s before reporting not-ready.
          const deadline = Date.now() + 120000
          let live: unknown = undefined
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 1500))
            live = await fetchJson(LIVEZ_URL)
            if (live !== undefined) break
          }
          sendJson(response, 200, {
            ok: true,
            healthyAfterStart: live !== undefined,
          })
        } catch (err) {
          sendJson(response, 500, { error: String(err) })
        }
      },
    }),
    webServer.register({
      kind: 'exact',
      path: '/headroom-mgr/stop',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'method not allowed; use POST' })
          return
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: 'untrusted origin' })
          return
        }
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
