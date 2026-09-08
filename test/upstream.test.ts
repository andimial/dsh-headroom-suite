/**
 * 期望上游决议（resolveExpectedUpstream）的输入→输出锁定用例。
 *
 * 覆盖 ADR-0001（docs/adr/0001-upstream-derived-at-start.md）的固定三级
 * 优先级与「保存文件非法视为缺省、不抛错」的回退。只断言纯函数的映射：
 * 不 mock、不读文件、不触 spawn 等副作用。
 */
import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_ANTHROPIC_URL,
  DEEPSEEK_OPENAI_URL,
  HEADROOM_BASE_URL,
} from '../src/constants.ts'
import { HEADROOM_ENV_PRESET, resolveExpectedUpstream } from '../src/upstream.ts'

/** 断言一次决议落在官方上游：官方 OpenAI/Anthropic 端点 + anthropic 启用。 */
function expectOfficialUpstream(
  currentBaseURL: string | undefined,
  savedFileContent: string | undefined,
): void {
  expect(resolveExpectedUpstream(currentBaseURL, savedFileContent)).toEqual({
    kind: 'official',
    openaiApiUrl: DEEPSEEK_OPENAI_URL,
    anthropicEnabled: true,
    anthropicApiUrl: DEEPSEEK_ANTHROPIC_URL,
    envPreset: HEADROOM_ENV_PRESET,
  })
}

/** 断言一次决议落在第三方上游：OpenAI 上游为给定地址且不启用 anthropic。 */
function expectThirdPartyUpstream(
  currentBaseURL: string | undefined,
  savedFileContent: string | undefined,
  openaiApiUrl: string,
): void {
  expect(resolveExpectedUpstream(currentBaseURL, savedFileContent)).toEqual({
    kind: 'third-party',
    openaiApiUrl,
    anthropicEnabled: false,
    anthropicApiUrl: undefined,
    envPreset: HEADROOM_ENV_PRESET,
  })
}

describe('resolveExpectedUpstream（期望上游决议）', () => {
  describe('优先级 3：两者皆无时为官方上游', () => {
    it('baseURL 未定义 → 官方上游', () => {
      expectOfficialUpstream(undefined, undefined)
    })

    it('baseURL 空白 → 官方上游', () => {
      expectOfficialUpstream('   ', undefined)
    })

    it('baseURL 为官方拼写变体（/v1、尾斜杠、/anthropic 路径、首尾空白）→ 官方上游', () => {
      for (const baseURL of [
        'https://api.deepseek.com',
        'https://api.deepseek.com/',
        'https://api.deepseek.com/v1',
        'https://api.deepseek.com/v1/',
        'https://api.deepseek.com/anthropic',
        'https://api.deepseek.com/anthropic/',
        '  https://api.deepseek.com/v1  ',
      ]) {
        expectOfficialUpstream(baseURL, undefined)
      }
    })

    it('官方直连 + 陈旧保存文件 → 忽略保存文件，官方上游（优先级 2 只认压缩线路）', () => {
      expectOfficialUpstream('https://api.deepseek.com/v1', 'https://third.example.com/v1')
      expectOfficialUpstream(undefined, 'https://third.example.com/v1')
    })

    it('压缩线路 + 保存文件未定义 → 官方上游', () => {
      expectOfficialUpstream(HEADROOM_BASE_URL, undefined)
    })
  })

  describe('优先级 1：第三方直发线路（当前值优先）', () => {
    it('baseURL 为第三方 http(s) 地址 → 该地址为第三方上游（OpenAI 上游）', () => {
      expectThirdPartyUpstream('https://third.example.com/v1', undefined, 'https://third.example.com/v1')
    })

    it('第三方直发线路 + 合法保存文件并存 → 当前值优先，忽略保存文件', () => {
      expectThirdPartyUpstream('https://current.example.com/v1', 'https://saved.example.com/v1', 'https://current.example.com/v1')
    })

    it('当前值带首尾空白 → 以修剪后的地址为上游', () => {
      expectThirdPartyUpstream('  https://third.example.com/v1  ', undefined, 'https://third.example.com/v1')
    })
  })

  describe('优先级 2：压缩线路 + 保存文件', () => {
    it('压缩线路 + 保存文件为合法第三方地址 → 以保存文件地址为第三方上游（OpenAI 上游）', () => {
      expectThirdPartyUpstream(HEADROOM_BASE_URL, 'https://third.example.com/v1', 'https://third.example.com/v1')
      expectThirdPartyUpstream(HEADROOM_BASE_URL, 'http://relay.local:9000/api', 'http://relay.local:9000/api')
    })

    it.each([
      ['非 http 地址（ftp）', 'ftp://files.example.com'],
      ['非 http 地址（无协议）', 'relay.example.com/v1'],
      ['官方地址', 'https://api.deepseek.com/v1/'],
      ['本地代理地址', `  ${HEADROOM_BASE_URL}  `],
      ['垃圾串', 'not a url at all !!!'],
    ])('压缩线路 + 保存文件非法（%s）→ 视为缺省、回退官方上游、不抛错', (_label, saved) => {
      expect(() => resolveExpectedUpstream(HEADROOM_BASE_URL, saved)).not.toThrow()
      expectOfficialUpstream(HEADROOM_BASE_URL, saved)
    })

    it('压缩线路 + 保存文件空白 → 视为缺省，官方上游', () => {
      expectOfficialUpstream(HEADROOM_BASE_URL, '   ')
    })
  })

  describe('决议结果', () => {
    it('官方上游：OpenAI 上游与 anthropic 上游均为 DeepSeek 官方端点', () => {
      const result = resolveExpectedUpstream(undefined, undefined)
      expect(result.kind).toBe('official')
      expect(result.openaiApiUrl).toBe(DEEPSEEK_OPENAI_URL)
      expect(result.anthropicEnabled).toBe(true)
      expect(result.anthropicApiUrl).toBe(DEEPSEEK_ANTHROPIC_URL)
    })

    it('第三方上游：不启用 anthropic 上游（第三方不支 Claude Code）', () => {
      const result = resolveExpectedUpstream('https://third.example.com/v1', undefined)
      expect(result.kind).toBe('third-party')
      expect(result.anthropicEnabled).toBe(false)
      expect(result.anthropicApiUrl).toBeUndefined()
    })

    it('环境预设组：两种上游一致（DETECT_BACKEND=python / TOOL_SEARCH=off / DISABLE_KOMPRESS=1）', () => {
      const official = resolveExpectedUpstream(undefined, undefined)
      const thirdParty = resolveExpectedUpstream('https://third.example.com/v1', undefined)
      expect(official.envPreset).toEqual(HEADROOM_ENV_PRESET)
      expect(thirdParty.envPreset).toEqual(HEADROOM_ENV_PRESET)
    })
  })
})
