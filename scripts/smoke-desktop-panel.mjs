/**
 * Desktop-composition smoke test for the 「线路切换」 panel.
 *
 * Catches the bug class unit tests cannot: the panel must never read loopback
 * (`http://127.0.0.1:8787/*`) from the renderer, because the Desktop composition
 * runs the page on `dsh-app://app` and Headroom's CORS policy only reflects
 * `https?://(localhost|127.0.0.1|\[::1\])` — the response is withheld and the
 * panel reads 「不可达」 (and zero stats) while the proxy answers 200.
 *
 * Models the Desktop renderer faithfully and drives the REAL built browser
 * artifact (lib/client.js) under a minimal React shim:
 *
 *  - page origin is `dsh-app://app` (Electron registers the scheme with
 *    standard+corsEnabled; main.js gates on mainFrame.url.startsWith('dsh-app://app/'))
 *  - a cross-origin read of `http://127.0.0.1:8787/*` is performed against the
 *    LIVE proxy with that Origin, and Chromium's decision is applied: no
 *    `access-control-allow-origin` ⇒ the response is withheld ⇒ fetch throws.
 *  - same-origin `/headroom-mgr/*` requests are what the Electron main process
 *    forwards to the host webServer; those are stubbed per scripted proxy state.
 *
 * Requires a built lib/client.js (`pnpm build:client`).
 * Run: pnpm smoke:desktop — exit 0 = 面板报健康, exit 1 = 仍报不可达.
 */
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')

/** The Desktop renderer origin (see dsh-desktop lib/main.js). */
const PAGE_ORIGIN = 'dsh-app://app'
const HEADROOM_ORIGIN = 'http://127.0.0.1:8787'
const HEADROOM = `${HEADROOM_ORIGIN}/v1`
const DIRECT = 'https://api.deepseek.com'

/** Scripted proxy liveness as the host /livez probe would see it. */
let proxyUp = false

/** Raw HTTP GET with an explicit Origin, mirroring a browser request. */
function rawGet(url, origin) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', headers: origin === undefined ? {} : { origin }, timeout: 4000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({
        status: res.statusCode,
        acao: res.headers['access-control-allow-origin'],
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
    req.end()
  })
}

// ------------------------------------------------------------------ fetch model
globalThis.fetch = async (url, init) => {
  const target = String(url)
  if (/^https?:\/\//i.test(target)) {
    // Cross-origin loopback read: Chromium applies CORS to the response.
    const res = await rawGet(target, PAGE_ORIGIN)
    if (res.acao === undefined) {
      throw new TypeError(`Failed to fetch (CORS: ${PAGE_ORIGIN} not in Access-Control-Allow-Origin)`)
    }
    return { ok: res.status === 200, json: async () => JSON.parse(res.body) }
  }
  // Same-origin host route (forwarded by the Electron main process).
  const path = target.split('?')[0]
  if (path === '/headroom-mgr/status') {
    return { ok: true, json: async () => ({ running: proxyUp, version: proxyUp ? '0.37.0' : undefined, savedBaseURL: null }) }
  }
  if (path === '/headroom-mgr/stats') {
    return proxyUp
      ? { ok: true, json: async () => ({ persistent_savings: { lifetime: { requests: 3, tokens_saved: 100 } } }) }
      : { ok: false, json: async () => ({ error: 'headroom unreachable' }) }
  }
  if (path === '/headroom-mgr/route') {
    // The host writes llm-deepseek.baseURL; the panel's scope re-reads it.
    const target = JSON.parse(String(init?.body ?? '{}')).target
    if (target === 'headroom') setRoute(HEADROOM)
    else if (target === 'direct') setRoute(DIRECT)
    return { ok: true, json: async () => ({ ok: true, savedBaseURL: null }) }
  }
  throw new Error(`unexpected fetch ${target}`)
}

// ------------------------------------------------------------------ react shim
let hooks = []
let cursor = 0
let pendingEffects = []
let scheduled = false
let renderImpl = () => {}

function scheduleRender() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => { scheduled = false; renderImpl() })
}

const reactShim = {
  useState(init) {
    const i = cursor++
    if (hooks[i] === undefined) hooks[i] = { value: typeof init === 'function' ? init() : init }
    const slot = hooks[i]
    const set = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next
      if (!Object.is(value, slot.value)) { slot.value = value; scheduleRender() }
    }
    return [slot.value, set]
  },
  useEffect(fn, deps) {
    const i = cursor++
    const prev = hooks[i]
    const changed = prev === undefined || deps === undefined || prev.deps === undefined
      || deps.length !== prev.deps.length || deps.some((d, j) => !Object.is(d, prev.deps[j]))
    if (!changed) return
    if (prev?.cleanup !== undefined) prev.cleanup()
    const slot = { deps, cleanup: undefined, run: fn }
    hooks[i] = slot
    pendingEffects.push(slot)
  },
  useSyncExternalStore(subscribe, getSnapshot) {
    const i = cursor++
    if (hooks[i] === undefined) hooks[i] = { subscribed: false }
    if (!hooks[i].subscribed) { hooks[i].subscribed = true; subscribe(() => scheduleRender()) }
    return getSnapshot()
  },
}

const jsxRuntimeShim = {
  jsx: (type, props) => ({ type, props: props ?? {} }),
  jsxs: (type, props) => ({ type, props: props ?? {} }),
  Fragment: Symbol('Fragment'),
}

const requireShim = (id) => {
  if (id === 'react') return reactShim
  if (id === 'react/jsx-runtime') return jsxRuntimeShim
  throw new Error(`unexpected require(${id})`)
}

// ---------------------------------------------------------------- load bundle
let loaded
globalThis.window = { __ModuleLoader__: { load: ({ factory }) => { loaded = factory(requireShim) } } }
globalThis.document = undefined
new Function('window', 'require', readFileSync(bundlePath, 'utf8'))(globalThis.window, requireShim)

// ------------------------------------------------------------------ fake scope
const listeners = new Set()
const scope = {
  value: { baseURL: HEADROOM },
  getSnapshot() { return { status: 'ready', writable: true, value: { baseURL: scope.value.baseURL } } },
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
}
function setRoute(baseURL) {
  scope.value = { baseURL }
  for (const listener of listeners) listener()
}

// ------------------------------------------------------------------ fake slots
let Panel
const ctx = {
  effect: (fn) => fn(),
  locale: { register: () => {}, bind: () => (key) => key },
  configForms: { get: () => scope },
  get: () => undefined,
  slots: {
    inject: (_name, cb) => cb(),
    register: (meta, component) => { if (meta.id === 'dsh-headroom-route') Panel = component },
  },
}
loaded.apply(ctx)
if (Panel === undefined) throw new Error('panel was not registered')

// -------------------------------------------------------------------- renderer
const instances = new Map()
function renderNode(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(renderNode)
  if (typeof node.type === 'function') {
    let instance = instances.get(node.type)
    if (instance === undefined) { instance = { hooks: [], pending: [] }; instances.set(node.type, instance) }
    const saved = { cursor, hooks, pendingEffects }
    cursor = 0
    hooks = instance.hooks
    pendingEffects = instance.pending
    const out = node.type(node.props)
    const queued = pendingEffects
    instance.pending = []
    pendingEffects = []
    for (const effect of queued) {
      const cleanup = effect.run()
      effect.cleanup = typeof cleanup === 'function' ? cleanup : undefined
    }
    ;({ cursor, hooks, pendingEffects } = saved)
    return renderNode(out)
  }
  const props = node.props ?? {}
  if ('children' in props) return { type: node.type, props: { ...props, children: renderNode(props.children) } }
  return node
}

function texts(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  return texts(node.props?.children)
}
function findButton(tree, label) {
  if (tree === null || typeof tree !== 'object') return undefined
  if (Array.isArray(tree)) {
    for (const child of tree) { const hit = findButton(child, label); if (hit !== undefined) return hit }
    return undefined
  }
  if (tree.type === 'button' && texts(tree.props?.children).includes(label)) return tree
  return findButton(tree.props?.children, label)
}
const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

let tree
const render = () => { renderImpl() }
renderImpl = () => { tree = renderNode({ type: Panel, props: { scope, t: (key) => key } }) }

const badges = () => texts(tree).filter((s) => s.startsWith('headroom') && s !== 'headroomStatus')
const warnings = () => texts(tree).filter((s) => s.includes('Warning'))
const log = (step) => console.log(`[smoke] ${step.padEnd(44)} badge=${JSON.stringify(badges())} warning=${JSON.stringify(warnings())}`)

// --------------------------------------------------------------------- run
// Root cause, against the live proxy: the same URL, two origins.
for (const origin of [PAGE_ORIGIN, 'http://127.0.0.1:19387']) {
  const res = await rawGet(`${HEADROOM_ORIGIN}/livez`, origin)
  console.log(`[smoke] live proxy GET /livez  Origin=${origin.padEnd(24)} status=${res.status} access-control-allow-origin=${res.acao ?? '(absent → renderer blocked)'}`)
}

console.log(`[smoke] bundle=${bundlePath} pageOrigin=${PAGE_ORIGIN}`)
render()
await settle()
log('1. panel on 压缩线路, proxy not answering yet')

proxyUp = true
await settle()
log('2. proxy healthy (awaiting poll / route change)')

const toDirect = findButton(tree, 'switchToDirect')
if (toDirect === undefined) throw new Error('switchToDirect button not found')
toDirect.props.onClick()
await settle()
log('3. clicked 切换到直连')

const toHeadroom = findButton(tree, 'switchToHeadroom')
if (toHeadroom === undefined) throw new Error('switchToHeadroom button not found')
toHeadroom.props.onClick()
await settle()
log('4. clicked 切换到压缩线路 (proxy answers 200)')

const down = badges().includes('headroomDown')
console.log(`[smoke] VERDICT: ${down ? 'RED — panel reports 不可达 while /livez answers 200' : 'GREEN — panel reports healthy'}`)
process.exit(down ? 1 : 0)
