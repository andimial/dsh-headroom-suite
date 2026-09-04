/**
 * 反馈环：settings 面板 host 命令通道的当前会话 id 解析。
 *
 * 用户症状：点击「安装 headroom 引擎」→
 *   操作失败：session "current" not found (session/not-found)
 *
 * 机制：插件向 host 的 commands.execute 发送了字面 'current' 作为会话 id；
 * Session Controller 把它当真实会话 id 查询并拒绝。
 *
 * 本脚本：
 *  1. legacyResolve —— 逐行复刻线上 lib/client.js 的旧解析逻辑
 *     （`sessions?.current?.()`，官方 ClientSessions 无此方法），
 *     断言它对官方 shape 产生真实会话 id → RED（复现症状机制）。
 *  2. resolveAgentId（src/client/agentId.ts，官方 list 快照读法）→ GREEN。
 *
 * 运行（两步，esbuild 以 CLI 预编译，规避沙箱内的 spawn 限制）：
 *   node node_modules/esbuild/bin/esbuild src/client/agentId.ts --loader=ts --format=esm --outfile=.repro-tmp/agentId.mjs
 *   node scripts/repro-agent-resolve.mjs
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const compiled = pathToFileURL(join(root, '.repro-tmp/agentId.mjs')).href

/** 官方 ClientSessions 最小切面：注意没有 current() 方法，只有 list 快照。 */
const officialSessions = {
  list: {
    getSnapshot: () => ({ ids: ['session-abc'], byId: {}, current: 'session-abc' }),
  },
  // 故意放一个同名非函数属性，复刻真实服务（current 是数据字段不是方法）
  current: undefined,
}

/** 旧实现：逐行复刻线上 src/client/index.ts 的解析逻辑（修复前）。 */
function legacyResolve(sessions) {
  let agentId = 'current'
  try {
    const current = sessions?.current?.()
    if (current !== undefined) agentId = current.sessionId
  } catch { /* keep 'current' */ }
  return agentId
}

const { resolveAgentId } = await import(compiled)

let failed = 0
const check = (label, fn) => {
  try {
    fn()
    console.log(`  [GREEN] ${label}`)
  } catch (error) {
    failed++
    console.log(`  [RED]   ${label}\n          ${error.message.split('\n')[0]}`)
  }
}

console.log('[1] 旧实现（线上行为复刻）× 官方 ClientSessions shape：')
check('应解析出真实会话 id "session-abc"，而非字面 "current"（→ host 回 session/not-found）', () => {
  assert.equal(legacyResolve(officialSessions), 'session-abc')
})

console.log('[2] 新实现 resolveAgentId × 官方 ClientSessions shape：')
check('有当前会话 → 返回 "session-abc"', () => {
  assert.equal(resolveAgentId(officialSessions), 'session-abc')
})
check('无当前会话（current undefined）→ 返回 undefined（调用方报明确错误，不发 "current"）', () => {
  const noSession = { list: { getSnapshot: () => ({ ids: [], byId: {}, current: undefined }) } }
  assert.equal(resolveAgentId(noSession), undefined)
})
check('sessions 服务缺失（undefined）→ 返回 undefined 且不抛', () => {
  assert.equal(resolveAgentId(undefined), undefined)
})
check('快照异常 → 返回 undefined 且不抛', () => {
  assert.equal(resolveAgentId({ list: { getSnapshot: () => { throw new Error('boom') } } }), undefined)
})

if (failed > 0) {
  console.log(`\nREPRO: ${failed} 项失败 —— 症状机制已复现（见 [RED]）。`)
  process.exitCode = 1
} else {
  console.log('\nPASS: 全部通过 —— 旧实现红 / 新实现绿，修复有效。')
}
