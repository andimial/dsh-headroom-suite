/**
 * 当前 agent 会话 id 解析 —— settings 面板 host 命令通道（runCommand）使用。
 *
 * 官方 ClientSessions（@deepseek-ai/dsh-api-session-controller，client 侧）
 * 没有 current() 方法：当前会话 id 挂在 list 快照上，唯一官方读法是
 * `sessions.list.getSnapshot().current`（参考官方消费方
 * dsh-client-ui-commands/lib/client.js 的 `ctx.get("sessions")` 用法，
 * 以及 ClientSessions.followCurrent 的 `this.list.getSnapshot().current`）。
 *
 * 解析不出真实会话 id 时必须返回 undefined，由调用方给出明确错误 ——
 * 绝不能向 host 发送字面 'current'：Session Controller 的
 * commands.execute 会把它当作会话 id 查询并以
 * `session "current" not found (session/not-found)` 拒绝。
 */

/** 官方 ClientSessions 中本插件依赖的最小切面（list 快照存储）。 */
export interface SessionsServiceFace {
  /** 快照存储：SessionListState（current 字段 = 当前选中会话 id）。 */
  list?: {
    getSnapshot?: () => { current?: string }
  }
}

/**
 * 从 client 根 ctx 的 sessions 服务解析当前会话 id。
 * @param sessions - `ctx.get('sessions')` 的结果（可能 undefined）。
 * @returns 当前会话 id；无法确定时返回 undefined。
 */
export function resolveAgentId(sessions: SessionsServiceFace | undefined): string | undefined {
  try {
    return sessions?.list?.getSnapshot?.().current
  } catch {
    return undefined
  }
}
