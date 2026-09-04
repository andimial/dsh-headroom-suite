## Problem Statement

在「代理管理」里启动 Headroom 代理进程后，代理总是把收到的请求转发给 DeepSeek 官方端点——即使 `llm-deepseek.baseURL` 配置的是第三方地址。用户想压缩第三方流量时的操作链是：录入第三方地址 → 切到「压缩线路」（baseURL 变为本地代理、第三方地址转入保存文件）→ 启动代理进程；结果代理仍转发 DeepSeek 官方，第三方请求 401/404 或打到错误的提供方。命令行入口 `/headroom-start` 同样写死官方端点。术语见 CONTEXT.md（线路/上游/期望上游/保存文件），决策背景见 ADR-0001。

## Solution

进程启动瞬间按 `llm-deepseek` 的状态推导「期望上游」，并用它构造代理上游参数：

- 当前 baseURL 是第三方地址 → 以该地址为 OpenAI 上游；
- 否则若 baseURL 处于压缩线路且保存文件含合法第三方地址 → 以保存文件中的地址为上游；
- 否则 → DeepSeek 官方（现状参数，行为不变）。

期望上游为第三方时**不启用 anthropic 上游参数**（代理只服务 OpenAI 协议、不支持 Claude Code）；期望上游为 DeepSeek 时维持现有双端点与环境预设。推导只发生在启动瞬间：已运行的代理不核对、不自动重启换上游。面板「代理管理」与命令 `/headroom-start` 两处启动入口行为一致。

## User Stories

1. As 代理管理面板用户, I want 在 `llm-deepseek.baseURL` 为第三方地址时点击「启动代理进程」后代理以该地址为上游, so that 代理服务的提供方与我的配置一致。
2. As 想压缩第三方流量的用户, I want 先录入第三方地址、再切到压缩线路后启动代理, so that 代理把请求转发到保存文件中的第三方地址、第三方流量走完整压缩链路。
3. As 使用官方直连线路的用户, I want 启动代理时上游仍是 DeepSeek 官方, so that 现行为不变、不产生意外请求。
4. As 使用压缩线路但没有第三方保存文件的用户, I want 启动代理时上游为 DeepSeek 官方, so that 官方压缩线路（现主场景）不受影响。
5. As 配置了官方端点拼写变体（带 `/v1`、尾斜杠、`/anthropic` 路径、空白）的用户, I want 这些值不被当作第三方上游, so that 判定与线路分类（routeOf）一致。
6. As 保存文件内容损坏或非法（非 http(s)、指向官方/本地代理、乱码）的用户, I want 启动不报错并按 DeepSeek 官方回退, so that 一个坏文件不会让代理无法启动。
7. As baseURL 已在官方直连但残留陈旧保存文件的用户, I want 启动代理时忽略该保存文件走 DeepSeek, so that 陈旧状态不会把我代到不想去的第三方。
8. As 期望上游为第三方的用户, I want 代理不携带 anthropic 上游（不支持 Claude Code 路线）, so that 不存在一条会发往 DeepSeek/第三方 anthropic 的意外路线。
9. As 期望上游为 DeepSeek 的用户, I want anthropic 上游参数与环境预设原样保留, so that Claude Code 经代理压缩走 DeepSeek 的既有能力不被破坏。
10. As 命令行用户, I want `/headroom-start` 与面板启动遵循同一上游推导, so that 两个入口不会各代各的。
11. As 代理已在运行的用户, I want 再点启动只得到 alreadyRunning 且进程不被重启/换上游, so that 我不会被悄悄杀进程。
12. As 想换上游的用户, I want 先停止再启动即按新线路重新推导上游, so that 换上游的路径简单可预期。
13. As 排查「转发目标不对」问题的用户, I want 启动响应与启动日志携带推导出的上游信息, so that 能确认代理实际代的是谁。
14. As 尚未配置任何 baseURL（设置节缺失/空白）的用户, I want 启动代理不报错并走 DeepSeek 官方, so that 全新环境零配置可用。
15. As 面板用户, I want 启动按钮的可用性逻辑不变（运行中禁用）, so that 现有操作习惯不被打断。
16. As 套件维护者, I want 两处启动入口共用同一个决议函数与参数构造器, so that 未来再改上游规则不会出现两处漂移。
17. As 实现 agent, I want 上游决议是一份纯函数输入输出契约（baseURL + 保存文件 → 决议结果）, so that 我可以无真实引擎地覆盖全部边界测试。
18. As 手动验收者, I want 一份针对真实第三方端点的端到端清单（鉴权透传、压缩生效、Claude Code 不外发）, so that 引擎层行为在发布前被实际确认。

## Implementation Decisions

- 新增**单一纯决议函数**：输入 = 当前 `llm-deepseek.baseURL`（字符串或缺省）+ 保存文件内容（字符串或缺省）；输出 = 决议结果（上游种类：官方/第三方、OpenAI 上游 URL、是否启用 anthropic 上游、环境预设组）。优先级固定：① 当前值判定为第三方 → 以该值作 OpenAI 上游；② 否则当前值处于压缩线路且保存文件为合法第三方（http(s) 且按既有分类非官方、非本地代理）→ 以保存文件值为上游；③ 否则 DeepSeek 官方。保存文件非法一律视为缺省并回退 ③，不抛错。
- 两处启动入口（web 管理路由与命令通道）分别读取设置与保存文件后，**调用同一决议函数**，再由共享的**参数构造器**产出 spawn 参数与环境：DeepSeek 分支逐字保留现有全部参数与环境预设（含 `HEADROOM_DETECT_BACKEND`、`HEADROOM_TOOL_SEARCH`、`HEADROOM_DISABLE_KOMPRESS`）；第三方分支输出 OpenAI 上游且**不输出 anthropic 上游参数**。
- 决议结果写入启动日志，并随启动成功响应返回（例如 `upstream` 字段）；alreadyRunning 路径维持现状（不重启、不改上游）。
- 收敛插件 home / venv / 保存文件的路径解析与读取到共享模块，消除当前两处各自重复的定义（现状靠注释同步）。
- **实现期取证任务**：确认引擎在未给 anthropic 上游参数时的缺省行为（`headroom proxy --help` + 本机实测）。若缺省会启用 Anthropic 官方端点，则用不可达的本地占位显式禁用，保证第三方分支的 Anthropic 协议请求失败于本地而非外发到任何真实端点。
- 不改设置 schema、不新增插件配置项；「第三方直发线路」语义不变；不引入运行中自动重启。

## Testing Decisions

- **测试 seam（已与用户确认）**：决议 + 参数构造的纯函数，vitest 单测。仓库当前零测试设施，本 spec 同时引入 vitest devDependency 与 `test` npm script，作为仓库首个测试基线。
- **好测试的定义**：只断言决议函数的输入 → 输出映射（外部行为），即给定 baseURL/保存文件组合得到期望的决议结果与参数结构；不 mock 也不触碰 spawn 等副作用。
- **被测矩阵**：baseURL 状态 × 保存文件状态全组合，边界至少覆盖：未定义/空白、官方拼写变体（`/v1`、尾斜杠、`/anthropic`、空白）、压缩线路地址、第三方 http(s)、保存文件非法（非 http、官方地址、本地代理地址、垃圾串）、官方直连 + 陈旧保存文件（应忽略）、第三方直发线路 + 保存文件并存（当前值优先）。
- **不做**：HTTP 路由级测试与真实引擎端到端自动化（需要真实 venv 与外部端点，脆且重）——留给手册验收。
- Prior art：仓库无既有测试可参照；用例命名用 CONTEXT.md 术语（期望上游/保存文件/第三方直发线路）。

## Out of Scope

- 面板 UI 增加「当前上游」展示（后续可选的体验项）。
- 运行中代理的上游核对、上游不一致自动重启、切换热生效。
- 取代式语义：写入第三方地址即自动把 baseURL 改到本地代理；启动时改写 baseURL。
- 按上游差异调整 `HEADROOM_*` 环境预设；第三方提供方鉴权 header 差异的处理（引擎层，手册验收）。
- 第三方上游下的统计口径适配（缓存折扣数字只对 DeepSeek 官方成立，README 已注明）。
- 真实第三方端点的自动化端到端测试。

## Further Notes

- 对齐文档：ADR-0001（决策与取舍）、CONTEXT.md（线路/上游/期望上游/保存文件词条）、README「面板/命令启动时的自动上游选择」小节（用户可见行为已先行成文）。
- 对应 `docs/research-other-provider-support.md` §4 清单：本 spec 落地第 1、2 条；第 4 条（鉴权链路实测）在手册验收；第 5 条（按提供方环境预设）明确 Out of Scope。
- 手册验收清单（发布前人工执行，需一个 OpenAI 兼容第三方端点，模拟服务亦可）：
  1. 录第三方 → 切压缩线路 → 启动：请求经代理到达第三方、压缩生效、无 502/鉴权错；
  2. 第三方上游模式下把 Claude Code 指向代理：请求应在本地失败/明确报错，不得外发到任何真实 anthropic 端点；
  3. 官方压缩线路回归：DeepSeek 双端点、健康检查、累计统计与改动前一致。

