# 调研：dsh-headroom-suite 是否只支持 DeepSeek 官方端点，能否接其他提供方模型

> 调研对象：本仓库插件 `@dsh-external/dsh-headroom-suite`（`dsh-headroom` + `dsh-headroom-manager` 合并套件）。
> 调研方式：静态源码取证（file:line 均为本仓库当前 HEAD）+ Headroom 上游文档/PR。
> 结论先行：**现状只支持 DeepSeek 官方上游；引擎本身不挑提供方，其他 OpenAI 兼容上游可以接，但需要改插件，不能零配置支持。**

## 1. 结论速览

| 问题 | 结论 |
| --- | --- |
| 当前是否只支持 DeepSeek 官方提供方地址？ | **是**。代理上游写死 `https://api.deepseek.com` 与 `https://api.deepseek.com/anthropic`；插件 UI 只切换 `llm-deepseek.baseURL`，且只认“直连 / Headroom 本地代理”两个值，没有其他提供方入口。 |
| Headroom 引擎能否转发到其他提供方？ | **能**。`--openai-api-url` / `--anthropic-api-url` 是通用上游参数——本仓库 README 自己写明其默认值是 `https://api.openai.com`（不是 DeepSeek），说明引擎按通用 OpenAI/Anthropic 协议上游设计。 |
| 插件“开箱即用”能否支持其他提供方模型？ | **不能**。两处 spawn 预设、HEADROOM_ENV 兼容项、面板路由识别都固化 DeepSeek。 |
| 改成支持其他提供方的工作量？ | 可控，见 §4 改动清单；需实测鉴权透传与统计口径。 |

## 2. 源码证据（本仓库 file:line）

### 2.1 上游端点全部写死

`src/constants.ts`

- `:12` `DEEPSEEK_ANTHROPIC_URL = 'https://api.deepseek.com/anthropic'`
- `:13` `DEEPSEEK_OPENAI_URL = 'https://api.deepseek.com'`
- `:16` `HEADROOM_BASE_URL = http://127.0.0.1:8787/v1`（插件写给 DSH 的“压缩线路”地址）
- `:18-19` `DIRECT_BASE_URL = 'https://api.deepseek.com'`（直连线路默认值）
- `:22` `LLM_DEEPSEEK_NAMESPACE = 'llm-deepseek'`（插件只操作这一个 provider 设置命名空间）

### 2.2 两处进程启动都固化 DeepSeek 预设

Host 命令通道 `src/index.ts` `startProxy()`：

- `:165-174` spawn 参数：`--anthropic-api-url` + `--openai-api-url` 均取 DeepSeek 常量
- `:180-187` 环境预设：`HEADROOM_TOOL_SEARCH=off`（注释：DeepSeek 不认识 Anthropic tool_search 类型）、`HEADROOM_DISABLE_KOMPRESS=1`（本机 HF 模型下载 0 字节的 workaround）

面板“代理管理”启停路由 `src/routes.ts`：

- `:29-39` `HEADROOM_ENV` 与上同源（注释要求与 `startProxy()` 保持一致）
- `:206-215` spawn 参数同样固化两个 DeepSeek URL

### 2.3 浏览器面板只有“直连/压缩”二元切换

`src/client/HeadroomPanel.tsx`

- `:52-56` `routeOf()`：baseURL 只识别 `undefined | DIRECT_BASE_URL`（direct）与 `HEADROOM_BASE_URL`（headroom），**其余一律标 unknown**
- `:128-142` `switchRoute()`：切换动作只有两种——`scope.unset('baseURL')`（直连）或写入 `HEADROOM_BASE_URL`（压缩线路），不存在“自定义上游地址”输入
- `:166-168` 文案三态：直连（api.deepseek.com）/ Headroom / 未知（baseURL 未识别）

### 2.4 README 自证参数通用性

`README.md`

- `:104-105` 参数表：`--openai-api-url` ——“OpenAI 协议上游（**DeepSeek 须填 `https://api.deepseek.com`**）”，默认 `https://api.openai.com`（境内会 502）→ **默认值是 OpenAI 官方，不是 DeepSeek，证明该参数按任意 OpenAI 兼容上游设计**
- `:110-118` 推荐启动命令显式带 DeepSeek 双端点
- `:172-176` 兼容性表：目前只有 OpenAI 协议（DSH 默认，DeepSeek 直连/Headroom 压缩）与 Anthropic 协议（Claude Code 经 Headroom 压缩）两行，模型侧均为 DeepSeek

## 3. 机制拆解（为什么“是/不是”两层答案）

- 两条“线路”的模型**都是 DeepSeek**：
  - 直连：DSH 把请求直接发到 `https://api.deepseek.com`；
  - 压缩：插件把 `llm-deepseek.baseURL` 写成 `http://127.0.0.1:8787/v1`，DSH 请求先到本地 Headroom，由 Headroom 转发到 DeepSeek 上游。
- Headroom 是通用压缩代理：上游地址由启动参数给出，默认值即 OpenAI 官方端点（README `:104`），因此**转发目标是谁取决于参数值，不取决于引擎**。
- 插件把所有参数值固化为 DeepSeek（§2.1/§2.2），并把“可配置面”压缩成 `llm-deepseek.baseURL` 的二元开关（§2.3），所以用户可见行为 = 只支持 DeepSeek。

## 4. 接其他提供方模型：最小改动清单（建议）

> **实现状态**（跟进 a4a954c 及其后续提交）：第 6 条已落地——`routeOf` 第三方识别（官方端点变体归直连）与面板「第三方 baseURL」录入 UI（`POST /headroom-mgr/route` 新增 `third-party` target）；第 1、2、4、5、7 条未实现，第 3 条未动。当前第三方线路语义 = DSH 直发该地址（不经压缩）。

目标场景：DSH（OpenAI 协议客户端）通过 Headroom 压缩访问**其他 OpenAI 兼容提供方**（第三方/自建网关等）。

1. **上游地址可配置化**：`src/constants.ts` 的 `DEEPSEEK_OPENAI_URL` 改为从配置读取（插件自有 settings 命名空间，或复用现有设置 seam），不再写死。
2. **两处 spawn 同步消费同一配置**：`src/index.ts:165-174` 与 `src/routes.ts:206-215` 当前靠注释“手动保持一致”，改造时应抽公共函数，避免漏改。
3. **DSH 侧 provider 指向代理**：插件现只写 `llm-deepseek.baseURL`（`constants.ts:22`）。接其他提供方时，需要在 DSH 对应 provider 的设置里把 baseURL 指向 `http://127.0.0.1:8787/v1`，或给插件加通用 provider 选择 seam。
4. **鉴权链路实测**：DSH 把 API key 发给本地代理后，Headroom 需把它正确带到新上游（DeepSeek 链路已被本套件验证；其他上游必须实测，含 header 格式差异）。
5. **环境预设按提供方调整**：`HEADROOM_TOOL_SEARCH=off` 是“DeepSeek 不认识 Anthropic tool_search”的兼容项（`src/index.ts:182`、`routes.ts:31`）；非 Anthropic 协议的上游未必适用，需按提供方分开预设。
6. **面板扩展**：`routeOf()`（`HeadroomPanel.tsx:52-56`）增加自定义 baseURL 识别与录入/选择 UI。当前 unknown 只是标签问题，请求本身照走——**最简 hack 是直接改 llm-deepseek.baseURL + 用自定义上游参数手动起代理**，面板显示 unknown 但不影响请求。
7. **统计口径**：面板展示的 cache 节省/`cache_savings_usd` 按上游机制解释。README `:74/:85` 强调的“DeepSeek 前缀缓存约 1/10 价”是 DeepSeek 官方计费机制，**换提供方后不适用**；Headroom 的确定性改写与压缩仍然生效，但省费大头（缓存折扣）会消失或改变。

## 5. 上游相关线索（Headroom）

- Getting Started / 代理配置文档：[headroom wiki getting-started](https://github.com/headroomlabs-ai/headroom/blob/main/wiki/getting-started.md)、[raw 版](https://raw.githubusercontent.com/headroomlabs-ai/headroom/main/wiki/getting-started.md)
- 客户端按请求选择上游（`x-headroom-base-url`）：[PR #1712 路由文档](https://github.com/headroomlabs-ai/headroom/pull/1712)、[PR #1763：`/v1/messages` 路由支持 x-headroom-base-url](https://github.com/headroomlabs-ai/headroom/pull/1763)
- v0.36.1 起对客户端自选上游加 SSRF 防护：[upstream_guard.py（v0.36.1）](https://github.com/headroomlabs-ai/headroom/blob/v0.36.1/headroom/proxy/upstream_guard.py)
- 本套件实测锁定 **Headroom v0.35.0**（README `:82`），per-request 上游选择是否在 0.35.0 可用**未在本仓库验证**——如要“一个代理同时服务多个提供方”，优先考虑：多端口多实例，或升级引擎后实测 `x-headroom-base-url`。

## 6. 保留意见（诚实边界）

- 本次是静态代码调研，**未**实际用第三方上游起代理做端到端实测（鉴权透传、模型名兼容、压缩质量均需实测）。
- 其他提供方各自的计费/缓存折扣机制不同，README 的实测节省数字（`README.md:82-90`）只对 DeepSeek 官方有效。
- “提供方/模型注册”属 DSH Harness 侧能力（provider 与 model 列表、设置命名空间），不在本插件代码内；本插件只是操纵其中一个命名空间的 baseURL。
