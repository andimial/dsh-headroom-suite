/**
 * 共享参数构造器（buildProxySpawnPlan）与启动日志行（startupLogLine）的
 * 锁定用例。两处启动入口（src/index.ts /headroom-start 与
 * src/routes.ts /headroom-mgr/start）都经「决议 → 构造器」产出 spawn
 * argv 与 env，这里锁定两条分支的字节级形状：
 *
 *  - 官方分支：argv 与改动前（两入口各自手拼）逐字一致——回归锁定；
 *  - 第三方分支：OpenAI 上游为决议值，anthropic 固定不可达本地占位
 *    （issue #4 取证结论：缺省会外发官方端点，必须显式禁用），argv 中
 *    不出现任何 api.deepseek.com。
 *
 * 构造器只做纯拼接、不做 I/O；logFile 可由调用方显式传入（缺省取共享
 * proxyLogPath()，仅是路径拼接，同样不读盘）。
 */
import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_ANTHROPIC_URL,
  DEEPSEEK_OPENAI_URL,
  HEADROOM_BASE_URL,
  HEADROOM_PORT,
} from '../src/constants.ts'
import { proxyLogPath } from '../src/paths.ts'
import { ANTHROPIC_DISABLED_URL, buildProxySpawnPlan, startupLogLine } from '../src/spawn.ts'
import { HEADROOM_ENV_PRESET, resolveExpectedUpstream } from '../src/upstream.ts'

const LOG_FILE = 'C:/tmp/proxy.test.log'

/** 官方上游（优先级 3 的原始输入）构造出的完整计划。 */
function officialPlan(): ReturnType<typeof buildProxySpawnPlan> {
  return buildProxySpawnPlan(resolveExpectedUpstream(undefined, undefined), LOG_FILE)
}

/** 压缩线路 + 合法第三方保存文件（优先级 2）构造出的第三方计划。 */
function thirdPartyPlan(): ReturnType<typeof buildProxySpawnPlan> {
  return buildProxySpawnPlan(
    resolveExpectedUpstream(HEADROOM_BASE_URL, 'https://third.example.com/v1'),
    LOG_FILE,
  )
}

describe('buildProxySpawnPlan（共享参数构造器）', () => {
  describe('官方分支（DeepSeek）', () => {
    it('argv 与改动前两入口手拼的数组逐字一致（回归锁定）', () => {
      expect(officialPlan().args).toEqual([
        'proxy',
        '--port', String(HEADROOM_PORT),
        '--anthropic-api-url', DEEPSEEK_ANTHROPIC_URL,
        '--openai-api-url', DEEPSEEK_OPENAI_URL,
        '--host', '127.0.0.1',
        '--connect-timeout-seconds', '15',
        '--request-timeout-seconds', '120',
        '--log-file', LOG_FILE,
      ])
    })

    it('env：三预设键与决议的环境预设组一致，并继承当前进程 env', () => {
      const env = officialPlan().env
      for (const [key, value] of Object.entries(HEADROOM_ENV_PRESET)) {
        expect(env[key]).toBe(value)
      }
      expect(env.PATH).toBe(process.env.PATH)
    })

    it('logFile 缺省取共享 proxyLogPath()', () => {
      const plan = buildProxySpawnPlan(resolveExpectedUpstream(undefined, undefined))
      expect(plan.args.at(-1)).toBe(proxyLogPath())
    })

    it('upstream 摘要：官方种类 + 双官方端点', () => {
      expect(officialPlan().upstream).toEqual({
        kind: 'official',
        openaiApiUrl: DEEPSEEK_OPENAI_URL,
        anthropicApiUrl: DEEPSEEK_ANTHROPIC_URL,
      })
    })

    it('决议违约（enabled 却无 anthropic URL）→ 响亮抛错，绝不静默落占位', () => {
      const broken = { ...resolveExpectedUpstream(undefined, undefined), anthropicApiUrl: undefined } as Parameters<typeof buildProxySpawnPlan>[0]
      expect(() => buildProxySpawnPlan(broken, LOG_FILE)).toThrow('no anthropic URL')
    })
  })

  describe('第三方分支（按 #4 取证结论显式禁用 anthropic）', () => {
    it('OpenAI 上游为决议值，anthropic 为不可达本地占位', () => {
      const args = thirdPartyPlan().args
      const anthropic = args[args.indexOf('--anthropic-api-url') + 1]
      const openai = args[args.indexOf('--openai-api-url') + 1]
      expect(openai).toBe('https://third.example.com/v1')
      expect(anthropic).toBe(ANTHROPIC_DISABLED_URL)
    })

    it('占位地址确为本地不可达（127.0.0.1:9，discard 端口）', () => {
      expect(ANTHROPIC_DISABLED_URL).toBe('http://127.0.0.1:9')
    })

    it('argv 中不出现任何 api.deepseek.com（无外发 DeepSeek 的上游参数）', () => {
      expect(thirdPartyPlan().args.join(' ')).not.toContain('api.deepseek.com')
    })

    it('第三方直发线路（优先级 1）同样落在占位上', () => {
      const plan = buildProxySpawnPlan(
        resolveExpectedUpstream('https://direct.example.com/api', undefined),
        LOG_FILE,
      )
      expect(plan.args).toContain(ANTHROPIC_DISABLED_URL)
      expect(plan.upstream.kind).toBe('third-party')
    })

    it('env 预设组与官方分支完全一致', () => {
      const official = officialPlan().env
      const third = thirdPartyPlan().env
      for (const key of Object.keys(HEADROOM_ENV_PRESET)) {
        expect(third[key]).toBe(official[key])
      }
    })

    it('upstream 摘要：第三方种类 + OpenAI 决议值 + anthropic 占位', () => {
      expect(thirdPartyPlan().upstream).toEqual({
        kind: 'third-party',
        openaiApiUrl: 'https://third.example.com/v1',
        anthropicApiUrl: ANTHROPIC_DISABLED_URL,
      })
    })
  })

  describe('决议 → 构造器端到端（两入口共用的完整接缝）', () => {
    it('官方直连 / 压缩+保存文件 / 第三方直发 三场景的 argv 上游与决议一致', () => {
      const scenarios = [
        { input: ['https://api.deepseek.com/v1', undefined] as const, openai: DEEPSEEK_OPENAI_URL, kind: 'official' },
        { input: [HEADROOM_BASE_URL, 'http://relay.local:9000/api'] as const, openai: 'http://relay.local:9000/api', kind: 'third-party' },
        { input: ['https://direct.example.com/api', undefined] as const, openai: 'https://direct.example.com/api', kind: 'third-party' },
      ]
      for (const s of scenarios) {
        const plan = buildProxySpawnPlan(resolveExpectedUpstream(s.input[0], s.input[1]), LOG_FILE)
        expect(plan.upstream.kind).toBe(s.kind)
        expect(plan.args[plan.args.indexOf('--openai-api-url') + 1]).toBe(s.openai)
      }
    })
  })
})

describe('startupLogLine（启动日志行）', () => {
  it('官方分支：时间戳 + pid + 决议结果', () => {
    const line = startupLogLine(officialPlan(), 4242)
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z? /)
    expect(line).toContain('spawned headroom proxy pid=4242')
    expect(line).toContain('upstream=official')
    expect(line).toContain(`openai=${DEEPSEEK_OPENAI_URL}`)
    expect(line).toContain(`anthropic=${DEEPSEEK_ANTHROPIC_URL}`)
    expect(line.endsWith('\n')).toBe(true)
  })

  it('第三方分支：anthropic 记录为占位地址', () => {
    const line = startupLogLine(thirdPartyPlan(), 17)
    expect(line).toContain('upstream=third-party')
    expect(line).toContain(`anthropic=${ANTHROPIC_DISABLED_URL}`)
  })

  it('pid 缺失时以 ? 记录、不抛错', () => {
    expect(() => startupLogLine(officialPlan(), undefined)).not.toThrow()
    expect(startupLogLine(officialPlan(), undefined)).toContain('pid=?')
  })
})
