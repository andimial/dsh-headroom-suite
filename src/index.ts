/**
 * dsh-headroom-suite host half: the merged Headroom suite.
 *
 * Combines the two former plugins:
 *  - dsh-headroom: engine install (venv), proxy lifecycle commands
 *    (/headroom-status|install|start|stop), route-switch settings seam
 *  - dsh-headroom-manager: /headroom-mgr/* HTTP routes driving the browser
 *    "代理管理" panel (status/start/stop + lifetime savings)
 *
 * This plugin only *integrates* Headroom — it does not reimplement the
 * compression engine. See NOTICE for the upstream attribution.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { spawn, execFile } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { HEADROOM_PORT } from './constants.ts'
import {
  installLogPath, pluginHome, readSavedBaseURL, venvCreateLogPath, venvDir, venvHeadroom, venvPython,
} from './paths.ts'
import { mountManagerRoutes } from './routes.ts'
import { buildProxySpawnPlan, formatUpstream, readSettingsBaseURL, spawnDetachedAndLog } from './spawn.ts'
import { resolveExpectedUpstream } from './upstream.ts'

export { DEEPSEEK_ANTHROPIC_URL, DEEPSEEK_OPENAI_URL, DIRECT_BASE_URL, HEADROOM_BASE_URL, HEADROOM_LIVEZ_URL, HEADROOM_PORT, LLM_DEEPSEEK_NAMESPACE, PLUGIN_NAME } from './constants.ts'

/** Resolve a usable system Python (python3 / python / py launcher). */
function findSystemPython(): Promise<string | undefined> {
  const candidates = process.platform === 'win32'
    ? ['python', 'py -3.13', 'py -3.12', 'py -3.11', 'py -3.10']
    : ['python3', 'python']
  return new Promise((resolve) => {
    let index = 0
    const tryNext = (): void => {
      if (index >= candidates.length) { resolve(undefined); return }
      const candidate = candidates[index++]
      execFile(candidate.split(' ')[0], [...candidate.split(' ').slice(1), '--version'], { timeout: 8000 }, (error, stdout, stderr) => {
        if (!error && /Python 3\.(1[0-9]|[0-9])/.test(`${stdout}${stderr}`)) resolve(candidate)
        else tryNext()
      })
    }
    tryNext()
  })
}

/** Whether the plugin-managed venv already contains Headroom. */
function venvReady(): boolean {
  return existsSync(venvPython()) && existsSync(venvHeadroom())
}

/** Whether a headroom proxy is currently answering on the port. */
export async function probeHealth(timeoutMs = 3000): Promise<{ healthy: boolean; version?: string }> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`http://127.0.0.1:${HEADROOM_PORT}/livez`, { signal: controller.signal })
      if (!response.ok) return { healthy: false }
      const body = (await response.json()) as { version?: string }
      return { healthy: true, version: typeof body.version === 'string' ? body.version : undefined }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { healthy: false }
  }
}

/** Run a command and resolve with its exit code (collecting output into the log). */
function run(command: string[], logPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' ? true : false,
      env: { ...process.env },
    })
    const chunks: Buffer[] = []
    child.stdout?.on('data', (c: Buffer) => chunks.push(c))
    child.stderr?.on('data', (c: Buffer) => chunks.push(c))
    child.on('close', (code) => {
      try {
        writeFileSync(logPath, Buffer.concat(chunks).toString('utf8'), { flag: 'a' })
      } catch { /* log best-effort */ }
      resolve(code ?? -1)
    })
  })
}

/**
 * Ensure a plugin-managed venv with `headroom-ai[proxy]` installed.
 * Reuses an existing venv; otherwise creates one and installs (this is the
 * heavy first-use step). Returns a human-readable outcome.
 */
export async function ensureInstalled(log: (message: string) => void): Promise<{ ok: boolean; message: string }> {
  mkdirSync(pluginHome(), { recursive: true })
  if (venvReady()) return { ok: true, message: 'Headroom already installed (plugin venv).' }

  const systemPython = await findSystemPython()
  if (systemPython === undefined) {
    return { ok: false, message: 'No Python 3.10+ found. Install Python first (Windows: also need MSVC Build Tools + Rust, see README).' }
  }

  log(`Creating venv with ${systemPython} ...`)
  const createCode = await run(
    process.platform === 'win32'
      ? [systemPython, '-m', 'venv', venvDir()]
      : [...systemPython.split(' '), '-m', 'venv', venvDir()],
    venvCreateLogPath(),
  )
  if (createCode !== 0) {
    return { ok: false, message: `Failed to create venv (exit ${createCode}). See ~/.dsh-headroom/venv-create.log` }
  }

  log('Installing headroom-ai[proxy] (lightweight, no torch) ...')
  const pip = process.platform === 'win32'
    ? [venvPython(), '-m', 'pip', 'install', '--disable-pip-version-check', 'headroom-ai[proxy]']
    : [venvPython(), '-m', 'pip', 'install', '--disable-pip-version-check', 'headroom-ai[proxy]']
  const installCode = await run(pip, installLogPath())
  if (installCode !== 0) {
    return { ok: false, message: 'pip install headroom-ai[proxy] failed. See ~/.dsh-headroom/install.log. On Windows, Rust/MSVC may be required (README).' }
  }
  return { ok: true, message: 'Headroom installed into plugin venv.' }
}

/**
 * Start the Headroom proxy detached from this process, with the DeepSeek
 * compatibility presets. The expected upstream (期望上游) is derived once,
 * right before the spawn: getBaseURL() is called only after the
 * install/health preflight so it reflects the `llm-deepseek` state of the
 * start instant; the saved third-party address (保存文件) is read alongside
 * it. A proxy that is already running is never re-targeted. Returns the
 * spawn outcome (the proxy needs a few seconds to become healthy); the
 * resolved upstream is rendered into the message and the startup log.
 */
export async function startProxy(
  log: (message: string) => void,
  getBaseURL: () => string | undefined,
): Promise<{ ok: boolean; message: string }> {
  if (!venvReady()) {
    const installed = await ensureInstalled(log)
    if (!installed.ok) return installed
  }
  mkdirSync(pluginHome(), { recursive: true })
  const health = await probeHealth(1500)
  if (health.healthy) return { ok: true, message: 'Headroom already running.' }

  const plan = buildProxySpawnPlan(resolveExpectedUpstream(getBaseURL(), readSavedBaseURL()))
  try {
    const pid = spawnDetachedAndLog(plan)
    log(`Headroom proxy starting (pid ${pid ?? '?'}, ${formatUpstream(plan.upstream)}). Waiting for health...`)
    // Cold start loads transformers/tokenizers from a cold venv — measured
    // ~50-90s on this machine; poll up to 120s.
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const now = await probeHealth(1500)
      if (now.healthy) {
        return {
          ok: true,
          message: `Headroom healthy (v${now.version ?? '?'}). ${formatUpstream(plan.upstream)}.`,
        }
      }
    }
    return {
      ok: true,
      message: `Headroom process started; health check still warming up (cold start). ${formatUpstream(plan.upstream)}.`,
    }
  } catch (error) {
    return { ok: false, message: `Failed to start Headroom: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Stop any headroom proxy listening on the plugin port (best-effort). */
export async function stopProxy(log: (message: string) => void): Promise<{ ok: boolean; message: string }> {
  const health = await probeHealth(1500)
  if (!health.healthy) return { ok: true, message: 'Headroom is not running.' }
  // Kill whatever listens on the plugin port (Windows: taskkill by PID tree).
  const owner = await new Promise<number | undefined>((resolve) => {
    execFile('powershell', [
      '-NoProfile', '-Command',
      `(Get-NetTCPConnection -LocalPort ${HEADROOM_PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess`,
    ], { timeout: 8000 }, (error, stdout) => {
      if (error) { resolve(undefined); return }
      const pid = Number(String(stdout).trim())
      resolve(Number.isInteger(pid) && pid > 0 ? pid : undefined)
    })
  })
  if (owner !== undefined) {
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/PID', String(owner), '/T', '/F'], { timeout: 8000 }, () => resolve())
    })
  } else {
    // Fallback: kill by image name.
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/F', '/IM', 'headroom.exe'], { timeout: 8000 }, () => resolve())
    })
  }
  log('Headroom proxy stopped.')
  return { ok: true, message: 'Headroom proxy stopped.' }
}

/** Current status: installed? running? healthy? */
export async function status(): Promise<{
  installed: boolean
  running: boolean
  healthy: boolean
  version?: string
  python?: string
}> {
  const [health, py] = await Promise.all([probeHealth(2000), findSystemPython()])
  return {
    installed: venvReady(),
    running: health.healthy,
    healthy: health.healthy,
    version: health.version,
    python: py,
  }
}

/**
 * cordis entry. Registers the `/headroom` command family so both the browser
 * UI and the agent can drive the Headroom lifecycle through the standard
 * command channel, plus the /headroom-mgr/* HTTP routes for the browser
 * process-management panel (merged from dsh-headroom-manager).
 */
export const inject = ['commands', 'settings']

export function apply(ctx: Context): void {
  const log = (message: string): void => { ctx.logger?.info(`[dsh-headroom-suite] ${message}`) }

  ctx.inject(['settings', 'webServer'], (scoped: Context) => {
    scoped.effect(() => mountManagerRoutes(scoped), 'dsh-headroom-suite http routes')
  })

  ctx.effect(function* () {
    yield ctx.commands.register({
      name: 'headroom-status',
      description: 'Show Headroom proxy status (installed / running / healthy)',
      handler: async () => {
        const s = await status()
        const text = [
          `Headroom: ${s.healthy ? `healthy v${s.version ?? '?'}` : s.running ? 'running (not healthy yet)' : 'not running'}`,
          `Installed: ${s.installed ? 'yes (plugin venv)' : 'no (run /headroom install)'}`,
          `Python: ${s.python ?? 'not found'}`,
        ].join('\n')
        return { kind: 'success', text }
      },
    })

    yield ctx.commands.register({
      name: 'headroom-install',
      description: 'Install the Headroom compression engine into the plugin venv',
      handler: async () => {
        const result = await ensureInstalled(log)
        return { kind: result.ok ? 'success' : 'error', text: result.message }
      },
    })

    yield ctx.commands.register({
      name: 'headroom-start',
      description: 'Start the Headroom compression proxy (with DeepSeek compatibility presets)',
      handler: async () => {
        const result = await startProxy(log, () => readSettingsBaseURL(ctx))
        return { kind: result.ok ? 'success' : 'error', text: result.message }
      },
    })

    yield ctx.commands.register({
      name: 'headroom-stop',
      description: 'Stop the Headroom compression proxy',
      handler: async () => {
        const result = await stopProxy(log)
        return { kind: result.ok ? 'success' : 'error', text: result.message }
      },
    })
  }, 'dsh-headroom command lifecycle')
}
