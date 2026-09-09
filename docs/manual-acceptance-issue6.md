# 手册验收报告：真实（模拟）第三方端点端到端清单 — Issue #6

- 执行日期：2026-09-09
- 代码基线：`dev` 分支 `e97c6e0`（feat: 参数构造器 + 两处启动入口接入期望上游决议 (#5)）
- 引擎：headroom-ai 0.37.0（插件 venv `~/.dsh-headroom/venv`）
- 执行方式：模拟第三方端点（本机 mock，OpenAI 协议）+ 真实插件路由（host webServer `:3080` 的 `/headroom-mgr/*`）+ 受控引擎启动。issue 预留的「人工操作」部分（真实第三方账号、真实 Claude Code 客户端）标注见「待人工补充」。
- 脚本：`scripts/manual-acceptance/issue6/`；证据：`artifacts/evidence/issue6/`。

## 方法

1. **mock 第三方端点**（`mock-upstream.mjs`，`127.0.0.1:18081`）：OpenAI 兼容 `/v1/chat/completions`（流式/非流式）与 `/v1/models`；每个请求落盘 `mock-requests.jsonl`（method/path/Authorization 存在性与前缀/body 字节数/摘要）。
2. **Anthropic 占位记录器**（同脚本，`127.0.0.1:9`）：命中即记录 `placeholder-port9.jsonl` 并立即断开（模拟不可达占位）——既留下「请求打到占位」的证据，又保持「本地失败」行为。
3. **真实链路**：录第三方 → 切压缩 → 启动全部走插件路由（`/headroom-mgr/route`、`/headroom-mgr/start`），带 Origin 头通过 CSRF 守卫；启动决议与参数构造即 #5 交付代码。
4. **受控引擎**（`proxy-runner.mjs`）：argv 与 `buildProxySpawnPlan` 输出逐字一致（第三方/官方两模式），仅代理进程内 `no_proxy` 修正为可解析值——原因见「发现的问题 P1」。

## 清单 1：录第三方 → 切压缩线路 → 启动 → 请求经代理到达第三方

**结论：通过（受控引擎下）；路由侧决议/构造/日志全对。**

执行序列（证据 `checklist1-result.json` 步骤 1–3、`checklist3-route-result.json` 对照）：

| 步骤 | 调用 | 结果 |
| --- | --- | --- |
| 录第三方 | `POST /headroom-mgr/route {target:'third-party', baseURL:'http://127.0.0.1:18081'}` | `200 {ok:true}`，`llm-deepseek.baseURL` = mock 地址 |
| 切压缩线路 | `POST /headroom-mgr/route {target:'headroom'}` | `200 {ok:true, savedBaseURL:'http://127.0.0.1:18081'}`，baseURL → `http://127.0.0.1:8787/v1`，保存文件写入 |
| 启动 | `POST /headroom-mgr/start` | `200 {ok:true, upstream:{kind:'third-party', openaiApiUrl:'http://127.0.0.1:18081', anthropicApiUrl:'http://127.0.0.1:9'}}` |
| 启动日志 | `startup.log` | `2026-09-09T03:32:38Z spawned headroom proxy pid=21540 upstream=third-party openai=http://127.0.0.1:18081 anthropic=http://127.0.0.1:9` |

请求验证（证据 `checklist1-controlled-result.json`、`checklist2-result.json`、`mock-requests.jsonl`）：

- **到达第三方**：mock 收到 `POST /v1/chat/completions`（流式与非流式各一），响应 200，客户端收到 `[mock-e2e] third-party upstream reached through headroom proxy`。
- **压缩生效**（硬证据，来自代理 `/stats`）：`compression.requests_compressed=1`，`avg_compression_pct=82.7`，`best_detail="4,224 → 729 tokens"`；客户端发出 50,613 字节，mock 收到 8,667 字节。
- **无 502/鉴权错**：两次经代理请求均 200；无 5xx（除清单 2 故意触发的占位 502）。
- **鉴权透传观察**：客户端带 `Authorization: Bearer sk-mock-e2e-not-a-real-key`（假 key），mock 记录 `authPresent:true, authPrefix:"Bearer sk-mo"`——OpenAI 路线的 Authorization 头原样透传，未被代理改写或剥离。盲点：记录器仅检查 `authorization` 头；`x-api-key` 等 Anthropic 形态鉴权头是否透传未取证（占位记录器显示 `authPresent:false` 只反映 `authorization` 头）。按 spec 该差异属引擎层 Out of Scope，此处如实记录。

## 清单 2：第三方上游下把 Claude Code（Anthropic 协议）指向代理

**结论：通过。请求在本地明确失败，未外发到任何真实 anthropic 端点。**

- 请求：`POST http://127.0.0.1:8787/v1/messages`，Anthropic 协议体（`model: claude-sonnet-4-5-20250929`，`x-api-key` 头，证据 `checklist2-result.json` 步骤 `c2-post-v1-messages`）。
- 响应：**502** + `{"type":"error","error":{"type":"api_error",...}}` —— 明确报错，符合「本地失败」预期。
- **不外发证据链**（`placeholder-port9.jsonl`）：
  1. argv 锁定：启动响应与 `startup.log` 均记录 `anthropic=http://127.0.0.1:9`（不可达占位，#4 取证结论的落地）；
  2. 占位记录器命中：`08:02:36/37/40` 三条 `POST /v1/messages`（body 即上述 Anthropic 请求）全部打到 `127.0.0.1:9` 后被记录器断开——请求终结于本地占位；
  3. 引擎 readyz 探测同样落在占位（`07:56:14 HEAD /` 记录）。
- 观察记录：代理对占位失败重试了 3 次（间隔约 1s/3s）后返回 502——行为合理，Claude Code 侧表现为快速失败。符合预期。
- 待人工补充：真实 Claude Code 客户端（`ANTHROPIC_BASE_URL` 指向代理）的端到端体验；本验收用等价 Anthropic 协议请求替代，代理视角无差别。

## 清单 3：官方压缩线路回归

**结论：通过。决议/参数/健康检查/累计统计与改动前一致。**

- 官方分支决议与参数（证据 `checklist3-route-result.json`）：构造官方压缩线路状态（删保存文件 → `route direct` 恢复官方直连 → `route headroom`）后启动，响应与 `startup.log` 均为 `upstream=official openai=https://api.deepseek.com anthropic=https://api.deepseek.com/anthropic`——DeepSeek 双端点逐字保持；`test/spawn.test.ts` 15 个用例继续逐字锁定 argv/env（33/33 全绿）。
- 健康检查（证据 `checklist3-runtime-result.json`，受控引擎以官方双端点运行）：`/livez` healthy（0.37.0）；`/readyz` ready 且 `checks.upstream = {url:'https://api.deepseek.com/anthropic', status:'healthy'}`——Anthropic 端点实测可达。
- 累计统计：`/stats-history.lifetime = {requests:300, tokens_saved:107478, cache_read_tokens:26,676,224, cache_savings_usd:17.19, total_input_tokens:28,284,478, ...}`——连续未清零；存储在引擎侧 `~/.headroom/proxy_savings.json`，#5/#6 改动（spawn 参数与日志路径）不触及该路径。
- alreadyRunning：活代理时再点启动得 `{ok:true, alreadyRunning:true}`，`startup.log` 无新增 spawn 行——不重启、不改上游、决议不执行。
- 待人工补充：携带真实 DeepSeek key 的官方线路真实对话回归（本验收未消费真实凭据，发送的均为假 key）。

## 发现的问题

| 编号 | 现象 | 归因与处置 |
| --- | --- | --- |
| P1 | 本机 host 进程环境 `no_proxy=localhost,127.0.0.1,::1,[::1]`，headroom 引擎启动期 LiteLLM 拉 model cost map 时 httpx 将 `::1,[::1]` 误解析为端口（`ValueError: invalid literal for int() with base 10: ':1]'`），uvicorn 未及绑定端口，代理启动即死。**走插件路由 spawn 的代理在本机因此永远 `healthyAfterStart=false`** | 环境 + 引擎健壮性组合问题，非 #5/#6 改动引入（单测 33/33 全绿、决议/构造/日志均正确）。验收改以受控引擎完成；**建议开新票**：决议/构造层可选项是 `no_proxy` 值合法性预检并告警（不动 envPreset 逐字约定） |
| P2 | 引擎 `--log-file ~/.dsh-headroom/proxy.log` 指定后文件始终未产生（0.37.0，两种上游模式均如此） | 观察项；统计与诊断依赖 `/stats`、`/stats-history` 不受影响。随 P1 票一并反馈引擎层 |
| P3 | LiteLLM 启动期无条件外发一次 `raw.githubusercontent.com`（model cost map）请求 | 非 LLM 流量、不涉及 anthropic 端点，不违反「不外发」约束；记录备查 |

其余差异均符合预期（见各清单「观察记录」）。

## 环境恢复

验收后已恢复：`route direct` → `restoredBaseURL:null`（官方直连原状）、保存文件已删、mock 与代理进程已停。

## 验收标准对照

- ✅ 清单 1/2/3 各有执行记录与证据（本文 + `artifacts/evidence/issue6/`）
- ✅ 发现的问题已注明处置（P1/P2 建议开新票，P3 符合预期范围）
- ✅ 鉴权透传观察有明确记录（含 `x-api-key` 盲点声明）
- ⏳ 待人工补充：真实第三方账号、真实 Claude Code 客户端、真实 DeepSeek key 对话（模拟端点等价替代已覆盖代理/决议/参数行为）
