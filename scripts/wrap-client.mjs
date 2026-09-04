/**
 * 把 esbuild CLI 产出的 body 拼上 dsh client loader 的 banner/footer，
 * 生成 lib/client.js（等价于 scripts/build.mjs 的 buildClient 产物，
 * 仅 sourcemap 行映射因 banner 前置略有偏移）。
 *
 * 运行：node scripts/wrap-client.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const pkgName = '@dsh-external/dsh-headroom-suite'

const body = readFileSync(join(root, '.repro-tmp/client.body.js'), 'utf8')
const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => {\n  var module = { exports: {} };\n  var exports = module.exports;\n`
const footer = '\nreturn module.exports; } });\n'
mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib/client.js'), banner + body.trimEnd() + footer)
console.log('[dsh-headroom-suite] client wrapped -> lib/client.js')
