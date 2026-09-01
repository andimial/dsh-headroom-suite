# dsh-headroom-suite

## 兼容的 Harness 版本

- **已验证支持**：DeepSeek Harness `0.1.0-rc.6`（web profile）。
- **最新版 `0.1.2-alpha.3`**：适配计划进行中，暂无确切完成时间。升级前请先备份你的 DSH 安装。


> DeepSeek Harness 的 **Headroom 压缩代理一体化套件**（二合一插件）——由 [dsh-headroom](https://github.com/wjxn13/dsh-headroom)（线路切换）与 [dsh-headroom-manager](https://github.com/wjxn13/dsh-headroom-manager)（代理管理）合并而成，一条命令安装全部功能。

**一句话定位**：把 [Headroom](https://github.com/headroomlabs-ai/headroom) 的**真实压缩引擎**接进 DeepSeek Harness，提供「一键切换压缩线路 + 代理进程管理 + 实时 token 统计」的完整面板。压缩由 Headroom 引擎在进程外完成，本套件负责环境、路由、UI 与监控，不重新实现压缩算法。

> **重要声明**：本套件是 Headroom（Apache-2.0）的**集成与封装**，Headroom 压缩引擎本身由 Headroom 项目提供，版权归其作者所有。本套件不包含、也不修改 Headroom 的压缩算法，仅负责：环境检测、依赖安装、进程管理、DeepSeek 兼容预设与线路切换 UI。详见 [NOTICE](./NOTICE) 与 [LICENSE](./LICENSE)。

---

## 功能总览

设置页新增两个分区：

### 1. 线路切换（order 20）

- **当前线路**显示：直连（`api.deepseek.com`）/ 压缩（Headroom `:8787`）
- 一键切换线路：写入 `llm-deepseek.baseURL`，热生效，下一次请求即走新线路
- Headroom 健康徽标（`/livez` 探测，版本号展示）
- **Token 节省统计**（实时）：最近 60 分钟花费、累计节省、累计输入、缓存命中率、请求数（每 10 秒刷新）
- 「安装 Headroom 引擎」按钮：自动创建隔离 venv 并安装 `headroom-ai[proxy]`

### 2. 代理管理（order 21）

- **启动 / 停止代理进程**（detached 启动，不随 dsh 重启而退出；按端口找 PID 停止）
- 实时健康状态（版本 + PID 徽标）
- **累计节省统计（lifetime）**：处理请求数、缓存命中节省、上下文压缩节省与 token 数

宿主半同时注册命令通道（`/headroom-status|install|start|stop`）与 HTTP 路由：

| 路由                     | 方法 | 说明                                    |
| ---------------------- | ---- | ------------------------------------- |
| `/headroom-mgr/status` | GET  | 探测 `/livez` + 读 `/stats-history` 节省统计 |
| `/headroom-mgr/start`  | POST | spawn headroom 代理（同源校验防 CSRF）         |
| `/headroom-mgr/stop`   | POST | 按 8787 端口找 PID 并停止（同源校验）              |

---

## 安装

```bash
dsh plugin --profile web add github:wjxn13/dsh-headroom-suite#main
```

装完重启 dsh 即可在设置页看到「线路切换」「代理管理」两个分区。

> **取代关系**：本套件已包含 dsh-headroom 与 dsh-headroom-manager 的全部功能，装了套件后无需再单独安装这两个插件（同装会重复注册设置分区）。

---

## 它省的是什么：与 DSH 自带压缩的分工

DeepSeek Harness **本身就有压缩能力**（`dsh-compaction-basic` 超预算时摘要旧对话；`dsh-compaction-tool-result-pruner` 超预算时修剪工具结果）——这些是**会话层的兜底**。本套件定位为**请求层的极致压缩**，三者互补、不重叠：

| 层                         | DSH 自带               | 本套件（Headroom 引擎） | dsh-caveman |
| ------------------------- | -------------------- | ---------------- | ----------- |
| 会话历史（摘要旧对话）               | ✅ compaction-basic   | ❌ 不碰历史（保护缓存前缀）   | ❌           |
| 工具结果（超预算修剪）               | ✅ tool-result-pruner | ❌ 保留原文（CCR 可逆）   | ❌           |
| **请求内（工具 schema / 跨轮冗余）** | ❌ 无                  | ✅ **本套件专攻**      | ❌           |
| 输出 token（让模型少说）           | ❌                    | ❌                | ✅ 提示词规则     |

为什么需要这一层：DSH 每次请求会**全量发送工具 schema**（数十个工具的完整 JSON 描述，可达数万 token），且多轮对话中跨轮内容存在大量冗余。Headroom 在**每次请求发出前**：

- **压缩工具 schema**（`tool_schema_compaction`）：去掉描述冗余，每次请求省数十 token
- **跨轮去重**（`cross_turn_dedup`）：删除与上一轮重复的内容
- **遇到大工具输出时**：一次省 8–20%（偶发但可观）

> 这套机制**不破坏 DeepSeek 的前缀缓存**——改写是确定性的，让 99.9% 输入走折扣价，这是它省钱的核心，压缩只是锦上添花。

---

## 诚实预期：到底能省多少

我们报的是**端到端 token 节省**——整轮对话里实际少发给模型的 token，而不是单条工具输出的字符压缩率。后者的数字往往更好看，但工具输出只占 token 总量的一小块，且 DSH 自带压缩已兜底、DeepSeek 前缀缓存吃掉大头，所以端到端收益通常远低于单条文本的压缩率。

### 本套件的真实实测（2026-08-26，dsh web + Headroom v0.35.0 + deepseek-v4-flash）

- **Headroom 代理层**：每请求稳定压缩约 **173 tok**（主要是 `tool_schema` 压缩，占输入约 1.2%），对 caller 透明、不影响质量。
- **真正的大头是前缀缓存**：每轮 **18k–37k tok 命中缓存**（DeepSeek 官方机制，Headroom 不破坏它），按约 1/10 价计费——这是长会话最大省费来源。
- **单次大输出 / 跨轮冗余触发时**：可省 8–20%（视内容而定）。

### 结论

想最大化省费，**稳定系统提示让 Headroom 冻结前缀缓存，比压缩档位更关键**；长期会话 + 固定系统提示收益最大。压缩器负责把「每次请求的新内容」压到最省，缓存负责把「重复内容」打成折扣价——两者正交、叠加生效。

---

## 配置：代理启动参数

本套件**不在 `cordis.patch.yml` 暴露压缩配置项**——压缩参数属于 Headroom 引擎本身，由代理启动命令决定。日常使用通过「代理管理」面板按钮启停即可，无需手填。

高级用户手动启动代理时，可用以下参数（**必须显式带 `--openai-api-url`**，见 Troubleshooting）：

| 参数                          | 说明                                                                   | 默认 / 推荐                              |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| `--port`                    | 代理监听端口                                                               | `8787`                               |
| `--host`                    | 绑定地址                                                                 | `127.0.0.1`                          |
| `--openai-api-url`          | OpenAI 协议上游（**DeepSeek 须填 `https://api.deepseek.com`**）              | 默认 `https://api.openai.com`（境内会 502） |
| `--anthropic-api-url`       | Anthropic 协议上游（走 Headroom 压缩时填 `https://api.deepseek.com/anthropic`） | —                                    |
| `--connect-timeout-seconds` | 连接超时                                                                 | `15`                                 |
| `--request-timeout-seconds` | 请求超时                                                                 | `120`                                |
| `--log-file`                | 日志文件路径                                                               | `~/.headroom/logs/proxy.log`         |

推荐启动命令：

```bash
headroom.exe proxy --port 8787 \
  --anthropic-api-url https://api.deepseek.com/anthropic \
  --openai-api-url https://api.deepseek.com \
  --host 127.0.0.1 \
  --connect-timeout-seconds 15 --request-timeout-seconds 120 \
  --log-file ~/.headroom/logs/proxy.log
```

---

## 与 dsh-caveman 配合

[caveman](https://github.com/wjxn13/dsh-caveman) 负责**输出侧**压缩，与本套件（**输入侧**压缩 + 线路/进程管理）互补。两者可同时安装。

### 实测结论（2026-08-26，dsh web + Headroom v0.35.0 + deepseek-v4-flash）

两个插件**完全兼容、无冲突**，作用在不同层，可叠加省 token：

| 层        | 负责插件                            | 省的是什么                                      |
| -------- | ------------------------------- | ------------------------------------------ |
| 代理层（透明）  | dsh-headroom-suite（Headroom 引擎） | 输入侧重复上下文压缩 + 前缀缓存对齐（缓存按 DeepSeek 1/10 价计费） |
| 人设层（需开关） | dsh-caveman                     | 输出 token（可切换 lite / full / ultra 档）        |

实测方法：每组开全新 session 切到 `deepseek-official/deepseek-v4-flash`，开放题（TCP 三次握手、HTTP/2 改进）各问 2 轮，对比 caveman 关 / ultra。

- **Headroom 代理层**：每请求稳定压缩约 **173 tok**（主要是 tool_schema 压缩，占输入约 1.2%），对 caller 透明、不影响质量；真正的大头是**前缀缓存命中**——每轮 18k–37k tok 命中缓存，是长会话最大省费来源。
- **caveman 输出侧**：ultra 档相对关闭，**输出 token 省 ~36.6%**（4098 → 2597）。
- **组合**：输入侧重复上下文由 Headroom 转前缀缓存（约 1/10 价），输出侧由 caveman 砍 ~37%，二者打在不同层可同时开。

---

## Troubleshooting

### 502 Bad Gateway（最常见）

**现象**：切换压缩线路后，走该路由的请求全部 502。
**原因**：代理启动**漏了 `--openai-api-url`**，路由回落到默认的 `https://api.openai.com`，境内 DNS 解析失败。
**解决**：显式带 `--openai-api-url https://api.deepseek.com`（见上方推荐启动命令）。通过面板启停时套件已固化此预设。

### 切换线路后无效果

确认 `llm-deepseek.baseURL` 已写入压缩线路地址；配置热生效，但个别会话需**下一次请求**才走新线路，必要时重启 dsh。

### Windows 下代理启动失败 / 无编译工具链

Headroom **0.35.0 起提供 Windows 预编译 wheel**（`headroom_ai-*-win_amd64.whl`，Python 3.10+），`pip install headroom-ai[proxy]` 直接安装，**无需 Rust 或 MSVC**。若遇 backend 检测问题，可设 `HEADROOM_DETECT_BACKEND=python` 与 `HEADROOM_TOOL_SEARCH=off` 作为兼容预设（套件「安装引擎」按钮已内置）。

### 端口冲突

默认 `8787` 被占用时，改 `--port` 并在面板/配置中同步，避免 `stop` 误杀其他进程。

### 缓存命中很高但「节省」数字低

**正常现象**。这说明大头已走 DeepSeek 折扣缓存（约 1/10 价），压缩器只负责边际的新内容——这正是设计目标，不必追求高压缩数字。

---

## 兼容性

| 协议                     | 线路                        | 状态     |
| ---------------------- | ------------------------- | ------ |
| OpenAI（DSH 默认）         | DeepSeek 直连 / Headroom 压缩 | ✅ 已实测  |
| Anthropic（Claude Code） | 经 Headroom 压缩             | ✅ 上游支持 |

---

## 开发

```bash
pnpm install        # 或 npm install
npm run build       # 构建 host lib + client bundle（scripts/build.mjs）
npm run build:host  # 仅构建宿主半
npm run build:client # 仅构建客户端
```

---

## 上游致谢

压缩引擎为 [Headroom](https://github.com/headroomlabs-ai/headroom)（Apache-2.0），本插件仅做集成与管理，详见 [NOTICE](./NOTICE)。
