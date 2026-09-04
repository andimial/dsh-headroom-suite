/**
 * dsh-headroom-suite browser half entry: registers BOTH settings sections.
 *
 *  - order 20 「线路切换」: route switching + live token stats + engine
 *    install, bound to the `llm-deepseek` settings namespace and the host
 *    command channel (from the former dsh-headroom plugin).
 *  - order 21 「代理管理」: proxy process start/stop + health + lifetime
 *    savings via the /headroom-mgr/* HTTP routes (from the former
 *    dsh-headroom-manager plugin).
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry)
// and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { HeadroomPanel } from './HeadroomPanel.tsx'
import type { DeepSeekRouteSettings, HeadroomPanelInjected } from './HeadroomPanel.tsx'
import { ManagerPanel } from './ManagerPanel.tsx'
import { en, zh, type HeadroomPanelKey } from './locales.ts'
import { resolveAgentId, type SessionsServiceFace } from './agentId.ts'
import { LLM_DEEPSEEK_NAMESPACE } from '../constants.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Headroom route panel copy. */
    'dsh-headroom': HeadroomPanelKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'dsh-headroom'

/**
 * Required services (cordis fiber inject). The `settings.section` declaration
 * lives in ui-settings-general's SettingsRoot entry; registration waits on it
 * through `slots.inject()`. `settingsScope` supplies the hot-reloaded
 * `llm-deepseek` namespace scope; `remote` + `remote.commands` expose the host
 * command channel used by the lifecycle buttons (same inject face as
 * dsh-client-ui-plan); `sessions` resolves the active agent id.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.commands', 'settingsScope', 'sessions']

/**
 * Register both Headroom panels once the `settings.section` declaration is on
 * the ledger, binding the `llm-deepseek` namespace scope for the page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-headroom-suite: copy dictionaries')

  const scope = ctx.settingsScope.bind<DeepSeekRouteSettings>({ namespace: LLM_DEEPSEEK_NAMESPACE })
  const t = ctx.locale.bind(NS) as HeadroomPanelInjected['t']
  // Host command channel: execute('/headroom-install') etc. via the commands
  // remote. The service shape is the official SessionRemotes.commands surface
  // (dsh-api-session-controller): execute(agentId, line, images, signal?)
  // resolving to RemoteResult ({ ok, value } | { ok, error }).
  const remote = ctx.get('remote') as {
    commands?: {
      execute: (agentId: unknown, line: string, images: readonly unknown[], signal?: AbortSignal) =>
        Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string; code: string } }>
    }
  } | undefined
  const sessions = ctx.get('sessions') as SessionsServiceFace | undefined
  const injected = (): HeadroomPanelInjected => ({
    scope,
    t,
    runCommand: async (line: string) => {
      // Resolve the current agent session id for the command RPC. Official
      // ClientSessions exposes it on the list snapshot (sessions.list
      // .getSnapshot().current) — there is no current() method. When it is
      // unavailable, fail with a clear message: sending a literal 'current'
      // gets rejected by the host as session/not-found.
      const agentId = resolveAgentId(sessions)
      if (agentId === undefined) {
        return { kind: 'error', text: t('error').replace('{message}', 'no active session — open a session before running host commands') }
      }
      const commands = remote?.commands
      if (commands?.execute === undefined) {
        return { kind: 'error', text: t('error').replace('{message}', 'host command channel unavailable') }
      }
      // RemoteResult triage, mirroring dsh-client-ui-commands' execute():
      // !ok → transport/admission failure; value === undefined → unknown
      // command; value.result carries the handler outcome { kind, text }.
      const raw = await commands.execute(agentId, line, [])
      if (raw.ok === false) {
        return { kind: 'error', text: t('error').replace('{message}', `${raw.error.message} (${raw.error.code})`) }
      }
      if (raw.value === undefined) {
        return { kind: 'error', text: t('error').replace('{message}', `unknown or malformed command: ${line}`) }
      }
      const outcome = (raw.value as { result?: { kind?: string; text?: string } }).result
      return {
        kind: outcome?.kind === 'error' ? 'error' : 'success',
        text: outcome?.text ?? 'OK',
      }
    },
  })

  ctx.slots.inject('settings.section', () => {
    // 「线路切换」— route switching + stats + engine install.
    ctx.slots.register({
      name: 'settings.section',
      id: 'dsh-headroom-route',
      order: 20,
      label: () => t('nav'),
      inject: injected,
    }, HeadroomPanel)
    // 「代理管理」— process lifecycle via /headroom-mgr/* HTTP routes.
    ctx.slots.register({
      name: 'settings.section',
      id: 'dsh-headroom-mgr',
      order: 21,
      label: () => '代理管理',
    }, ManagerPanel)
    return () => {}
  })
}
