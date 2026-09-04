---
status: accepted
---

# 代理上游目标与 baseURL 线路解耦，启动时按当前线路/保存文件推导

现状：套件启动 Headroom 代理的两处入口（面板 `POST /headroom-mgr/start` 与命令通道 `/headroom-start`）都把上游写死为 DeepSeek 官方端点，且 `llm-deepseek.baseURL` 一词兼任「客户端线路开关」与「上游来源」两种含义；第三方 baseURL 只有「直发线路」一种语义。后果：用户想把第三方流量纳入压缩时，先录第三方地址、再切到压缩线路（地址转入保存文件）、最后点启动代理——代理仍转发 DeepSeek，与用户期望不符。

决策：把「线路」与「上游」拆成两个正交概念（见 CONTEXT.md），并让**进程启动时刻**按三级规则推导期望上游：

1. 当前 `llm-deepseek.baseURL` 为第三方地址 → 以该地址作为 `--openai-api-url`；
2. 否则若 baseURL 处于压缩线路且保存文件含合法第三方地址 → 以保存文件中的地址作为上游；
3. 否则 → DeepSeek 官方上游（维持现状参数）。

期望上游为第三方时**不传** `--anthropic-api-url`（代理只服务 OpenAI 协议，不支持 Claude Code）；期望上游为 DeepSeek 时保持现有 anthropic 参数与环境预设不变。「第三方直发线路」（DSH 直发第三方、不经代理）语义原样保留。该推导只影响新启动：已在运行的进程不核对、不自动重启换上游。两处启动入口抽公共函数消费同一推导逻辑。

## Considered Options

- **只认当前 baseURL（字面最小实现）**：切到压缩线路后 baseURL 已变为 `127.0.0.1:8787/v1`，主场景（第三方流量经压缩）在启动时取不到第三方地址，仍转发 DeepSeek——被否。
- **保存文件优先于当前 baseURL**：用户已回官方直连但残留陈旧保存文件时会误代第三方——被否，因此规则 1 先于规则 2。
- **取代式语义（写入第三方地址即自动改写 baseURL 到代理）**：破坏「第三方直发线路」既有语义，改动面大——被否，保持并存。
- **第三方上游时 anthropic 仍指 DeepSeek**：与「第三方上游模式不走 Claude Code」的产品意图冲突，且同一代理混两套上游增加维护与鉴权风险——被否。

## Consequences

- 实现涉及两处 spawn（`src/index.ts startProxy` 与 `src/routes.ts /start`）的同步改造与公共函数抽取；上游推导读取 `ctx.settings` 与保存文件。
- `--anthropic-api-url` 省略时引擎的缺省行为需实现期以 `headroom proxy --help`/实测取证；若缺省会启用 Anthropic 官方端点，需显式禁用以满足「第三方上游不走 Claude Code」。
- 面板/README 需说明：第三方上游模式仅 OpenAI 协议；上游随启动时刻的线路而定，换上游 = 停后重启动。
- README 的节省口径（前缀缓存折扣）只对官方上游（DeepSeek）成立；第三方上游下统计口径待实测，本决策不改动统计实现。
- 启动回包与日志应携带推导出的上游，便于排查「代理转发目标与预期不符」类问题。
