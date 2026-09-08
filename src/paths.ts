/**
 * Single home for the launch-related paths and saved-baseURL sidecar access.
 * Both launch entries — the command channel (startProxy() in src/index.ts)
 * and the panel management routes (POST /headroom-mgr/start in src/routes.ts)
 * — import from here instead of keeping mirrored copies synced by comments.
 * The spawn env preset itself lives with the resolver (HEADROOM_ENV_PRESET in
 * src/upstream.ts); argv/env assembly is buildProxySpawnPlan in src/spawn.ts.
 *
 * Host half only: imports node:fs/os/path, so the browser bundle (which
 * imports only ./constants.ts) must never reach this module.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where the plugin keeps its venv and logs (per-user, versioned). */
export function pluginHome(): string {
  return join(homedir(), '.dsh-headroom')
}

/** The plugin-managed venv root inside {@link pluginHome}. */
export function venvDir(): string {
  return join(pluginHome(), 'venv')
}
/** Names of the venv binaries across platforms. */
export function venvPython(): string {
  return process.platform === 'win32' ? join(venvDir(), 'Scripts', 'python.exe') : join(venvDir(), 'bin', 'python')
}

/** The headroom.exe the plugin installs into its own venv. */
export function venvHeadroom(): string {
  return process.platform === 'win32' ? join(venvDir(), 'Scripts', 'headroom.exe') : join(venvDir(), 'bin', 'headroom')
}

/** The proxy process log inside plugin home (the engine's `--log-file`). */
export function proxyLogPath(): string {
  return join(pluginHome(), 'proxy.log')
}

/** Append-only record of proxy spawns (both launch entries), each line
 * carrying the upstream resolved at the start instant. */
export function startupLogPath(): string {
  return join(pluginHome(), 'startup.log')
}

/**
 * Append one pre-formatted startup-log line (best-effort: spawn reporting
 * must not fail because the log file is unwritable).
 */
export function appendStartupLog(line: string): void {
  try {
    writeFileSync(startupLogPath(), line, { flag: 'a' })
  } catch { /* log best-effort */ }
}

/** venv creation output log inside plugin home (referenced in error copy). */
export function venvCreateLogPath(): string {
  return join(pluginHome(), 'venv-create.log')
}

/** pip install output log inside plugin home (referenced in error copy). */
export function installLogPath(): string {
  return join(pluginHome(), 'install.log')
}

/**
 * Sidecar holding the `llm-deepseek.baseURL` value the user had before
 * switching to the Headroom route. Written only when that value selects the
 * third-party route per the shared `routeOf` (blank and official DeepSeek
 * spellings count as direct); read back and deleted when switching to direct.
 */
const SAVED_BASEURL_PATH = join(pluginHome(), 'saved-baseurl')

/** Read the saved third-party baseURL; undefined when absent or empty. */
export function readSavedBaseURL(): string | undefined {
  try {
    if (!existsSync(SAVED_BASEURL_PATH)) return undefined
    const value = readFileSync(SAVED_BASEURL_PATH, 'utf8').trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/** Persist the third-party baseURL to the sidecar. */
export function writeSavedBaseURL(baseURL: string): void {
  writeFileSync(SAVED_BASEURL_PATH, baseURL, 'utf8')
}

/**
 * Remove the sidecar. Returns false only when the file exists but could not
 * be removed (ENOENT counts as success), so callers can surface a stale
 * sidecar instead of silently keeping it.
 */
export function deleteSavedBaseURL(): boolean {
  try {
    unlinkSync(SAVED_BASEURL_PATH)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
  }
}
