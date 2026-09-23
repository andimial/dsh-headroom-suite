/**
 * Regression: the client entry must activate against the REAL host runtime.
 *
 * Mirrors the browser's client-fiber boot path in node: loads the built
 * lib/client.js bundle through a __ModuleLoader__ shim, drives it through the
 * host's cordis package, and provides only services the real web frontend
 * provides. If the entry injects a service the host does not provide, the
 * fiber stays PENDING and this test fails with the boot diagnostic — the
 * exact "web boot: entry did not activate" symptom.
 *
 * The host packages are resolved from the installed dsh CLI tree (the same
 * tree tsconfig.json paths point at), so this test tracks the deployed host.
 */
import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const HOST_CORDIS = 'E:/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js'

/** Services the stock web frontend provides (provider package in comments). */
const HOST_SERVICES: Record<string, unknown> = {
  slots: { inject: () => {}, register: () => {} }, // dsh-client-ui-renderer
  locale: { register: () => {}, bind: () => () => ({}) }, // dsh-client-locale
  connection: {}, // dsh-client-connection
  remote: {}, // dsh-api-gateway
  'remote.commands': {}, // dsh-api-remotes
  sessions: {}, // dsh-session
  configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ status: 'loading' }) }) }, // dsh-client-ui-settings
}

let entryCache: Promise<{ inject: string[]; apply: unknown }> | undefined

/** Loads the built bundle once per process (the ESM import cache replays nothing). */
function loadEntry(): Promise<{ inject: string[]; apply: unknown }> {
  entryCache ??= loadEntryFresh()
  return entryCache
}

async function loadEntryFresh(): Promise<{ inject: string[]; apply: unknown }> {
  const cordis = await import(pathToFileURL(HOST_CORDIS))
  const externals: Record<string, unknown> = {
    react: {},
    'react/jsx-runtime': {},
    'react-dom': {},
    'react-dom/client': {},
    '@deepseek-ai/cordis': cordis,
    '@deepseek-ai/dsh-client-ui-slots': {},
    '@deepseek-ai/dsh-client-ui-primitives': {},
    '@deepseek-ai/dsh-client-ui-attachment': {},
    '@deepseek-ai/dsh-client-schema-form': {},
    '@deepseek-ai/dsh-client-runtime/client': {},
  }
  const modules: Record<string, { inject: string[]; apply: unknown }> = {}
  ;(globalThis as Record<string, unknown>).window = globalThis
  ;(globalThis as Record<string, unknown>).__ModuleLoader__ = {
    load(spec: { id: string; factory: (req: (id: string) => unknown) => unknown }) {
      modules[spec.id] = spec.factory((id) => {
        if (id in externals) return externals[id]
        throw new Error(`unexpected require: ${id}`)
      }) as { inject: string[]; apply: unknown }
    },
  }
  await import(pathToFileURL(join(root, 'lib/client.js')))
  const entry = modules['@dsh-external/dsh-headroom-suite']
  if (entry === undefined) throw new Error('bundle did not register with __ModuleLoader__')
  return entry
}

describe('web boot activation', () => {
  it('injects only services the host web frontend provides', async () => {
    const entry = await loadEntry()
    const unknown = entry.inject.filter((service) => !(service in HOST_SERVICES))
    expect(unknown, `services missing from the host: ${unknown.join(', ')}`).toEqual([])
  })

  it('activates the client entry fiber (PENDING would reproduce the boot failure)', async () => {
    const entry = await loadEntry()
    const cordis = await import(pathToFileURL(HOST_CORDIS))
    const ctx = new cordis.Context()
    for (const [name, value] of Object.entries(HOST_SERVICES)) ctx.provide(name, value)

    const fiber = ctx.plugin(entry as never)
    await new Promise((resolve) => setTimeout(resolve, 100))

    const FIBER_ACTIVE = 2
    const missing = Object.keys(fiber.inject).filter((s) => fiber.ctx.get(s) === undefined)
    expect(
      fiber.state,
      `entry did not activate: pending (waiting for ${missing.join(', ') || 'unknown'})`,
    ).toBe(FIBER_ACTIVE)
  })
})
