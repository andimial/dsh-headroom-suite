/**
 * guardWrite 写防护的判定锁定（issue：桌面端「启动代理进程」403 untrusted origin）。
 *
 * 根因：桌面端（Electron）页面跑在 dsh-app://app origin，主进程
 * forwardWebRequest 转发 API 请求到宿主 http://127.0.0.1:19387 时按平台
 * 约定删除 origin/host/sec-fetch-site 头并注入宿主 cookie（dsh-desktop
 * lib/main.js forwardWebRequest）。平台自己的 /api 鉴权（dsh-client-connection
 * isTrustedApiRequest）对「无 Origin」放行、再验 SameSite=Strict 签名 cookie；
 * 而本插件旧 guard 只做 Origin.host === Host，桌面转发无 Origin 必 403。
 *
 * 修复后契约：宿主 connection 服务在场时，写防护完全委托平台的
 * requestRejection（Host fence + sec-fetch-site + Origin + cookie HMAC）；
 * connection 服务缺席（无该服务的组合）时回退旧的 Origin===Host 检查。
 */
import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createWriteGuard, type ConnectionAdmission } from '../src/routes.ts'

/** 造一个只带 headers 的请求桩（guardWrite 只读 method/headers）。 */
function fakeRequest(method: string, headers: Record<string, string>): IncomingMessage {
  return { method, headers } as unknown as IncomingMessage
}

/** 记录 sendJson 落点的响应桩。 */
function fakeResponse(): ServerResponse & { status: number; body: unknown } {
  const res = {
    status: 0,
    body: undefined as unknown,
    writeHead(status: number): void { this.status = status },
    end(payload?: string): void { this.body = payload === undefined ? undefined : JSON.parse(payload) },
  }
  return res as unknown as ServerResponse & { status: number; body: unknown }
}

/** 桌面端转发形状：主进程转发删除 origin，Host 为宿主 loopback authority。 */
const DESKTOP_HEADERS = { host: '127.0.0.1:19387' }

/** 平台 connection 服务桩：rejection 由用例给出。 */
function connectionOf(rejection: number | undefined): ConnectionAdmission {
  return { requestRejection: vi.fn(() => rejection) }
}

describe('guardWrite（宿主 connection 服务在场 → 委托平台判定）', () => {
  it('桌面转发形状（无 Origin）且平台放行 → 放行（issue 回归：旧代码此处 403）', () => {
    const guard = createWriteGuard(connectionOf(undefined))
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', DESKTOP_HEADERS), res)).toBe(true)
    expect(res.status).toBe(0) // 未写过错误响应
  })

  it('平台判 401（cookie 缺失/失效）→ 透传 401，不放行', () => {
    const guard = createWriteGuard(connectionOf(401))
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', DESKTOP_HEADERS), res)).toBe(false)
    expect(res.status).toBe(401)
  })

  it('平台判 403（fence 拒绝，如 sec-fetch-site: cross-site）→ 透传 403，不放行', () => {
    const guard = createWriteGuard(connectionOf(403))
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', DESKTOP_HEADERS), res)).toBe(false)
    expect(res.status).toBe(403)
  })

  it('浏览器直连形状（Origin 与 Host 匹配）且平台放行 → 放行', () => {
    const guard = createWriteGuard(connectionOf(undefined))
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' }), res)).toBe(true)
  })
})

describe('guardWrite（connection 服务缺席 → 回退 Origin===Host）', () => {
  it('无 Origin（桌面转发形状）→ 403（回退路径无法验 cookie，维持拒绝）', () => {
    const guard = createWriteGuard(undefined)
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', DESKTOP_HEADERS), res)).toBe(false)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'untrusted origin' })
  })

  it('Origin 与 Host 匹配 → 放行', () => {
    const guard = createWriteGuard(undefined)
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', { host: '127.0.0.1:19387', origin: 'http://127.0.0.1:19387' }), res)).toBe(true)
  })

  it('跨 host Origin → 403', () => {
    const guard = createWriteGuard(undefined)
    const res = fakeResponse()
    expect(guard(fakeRequest('POST', { host: '127.0.0.1:19387', origin: 'http://localhost:19387' }), res)).toBe(false)
    expect(res.status).toBe(403)
  })
})

describe('guardWrite（两种模式共用的方法闸）', () => {
  it('GET → 405，不触碰 connection 判定', () => {
    const connection = connectionOf(undefined)
    const guard = createWriteGuard(connection)
    const res = fakeResponse()
    expect(guard(fakeRequest('GET', DESKTOP_HEADERS), res)).toBe(false)
    expect(res.status).toBe(405)
    expect(connection.requestRejection).not.toHaveBeenCalled()
  })
})
