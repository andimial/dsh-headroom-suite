# dsh-headroom-suite

DeepSeek Harness 的 **Headroom 压缩代理一体化套件**（二合一插件）——由
[dsh-headroom](https://github.com/wjxn13/dsh-headroom)（线路切换）与
[dsh-headroom-manager](https://github.com/wjxn13/dsh-headroom-manager)（代理管理）
合并而成，一条命令安装全部功能。

## 功能总览

设置页新增两个分区：

### 1. 线路切换（order 20）

- **当前线路**显示：直连（api.deepseek.com）/ 压缩（Headroom :8787）
- 一键切换线路：写入 `llm-deepseek.baseURL`，热生效，下一次请求即走新线路
- Headroom 健康徽标（/livez 探测，版本号展示）
- **Token 节省统计**（实时）：最近 60 分钟花费、累计节省、累计输入、缓存命中率、请求数（每 10 秒刷新）
- 「安装 Headroom 引擎」按钮：自动创建隔离 venv 并安装 `headroom-ai[proxy]`

### 2. 代理管理（order 21）

- **启动 / 停止代理进程**（detached 启动，不随 dsh 重启而退出；按端口找 PID 停止）
- 实时健康状态（版本 + PID 徽标）
- **累计节省统计（lifetime）**：处理请求数、缓存命中节省、上下文压缩节省与 token 数

宿主半同时注册命令通道（`/headroom-status|install|start|stop`）与 HTTP 路由：

| 路由 | 方法 | 说明 |
|---|---|---|
| `/headroom-mgr/status` | GET | 探测 /livez + 读 /stats-history 节省统计 |
| `/headroom-mgr/start`  | POST | spawn headroom.exe（同源校验防 CSRF） |
| `/headroom-mgr/stop`   | POST | 按 8787 端口找 PID 并 taskkill（同源校验） |

## 安装

```bash
dsh plugin --profile web add github:wjxn13/dsh-headroom-suite#main
```

装完重启 dsh 即可在设置页看到「线路切换」「代理管理」两个分区。

> 取代关系：本套件已包含 dsh-headroom 与 dsh-headroom-manager 的全部功能，
> 装了套件后无需再单独安装这两个插件（同装会重复注册设置分区）。

## 与 dsh-caveman 配合

[caveman](https://github.com/wjxn13/dsh-caveman) 负责输出侧压缩，与本套件
（输入侧压缩 + 线路/进程管理）互补。两者可同时安装。

### 实测结论（2026-08-26，dsh web + Headroom v0.35.0 + deepseek-v4-flash）

两个插件**完全兼容、无冲突**，作用在不同层，可叠加省 token：

| 层 | 负责插件 | 省的是什么 |
|---|---|---|
| 代理层（透明） | dsh-headroom-suite（Headroom 引擎） | 输入侧重复上下文压缩 + 前缀缓存对齐（缓存按 DeepSeek 1/10 价计费） |
| 人设层（需开关） | dsh-caveman | 输出 token（可切换 lite / full / ultra 档） |

实测方法：每组开全新 session 切到 `deepseek-official/deepseek-v4-flash`，
开放题（TCP 三次握手、HTTP/2 改进）各问 2 轮，对比 caveman 关 / ultra。

- **Headroom 代理层**：每请求稳定压缩约 **173 tok**（主要是 tool_schema 压缩，占输入约 1.2%），
  对 caller 透明、不影响质量；真正的大头是**前缀缓存命中**——每轮 18k–37k tok 命中缓存，是长会话最大省费来源。
- **caveman 输出侧**：ultra 档相对关闭，**输出 token 省 ~36.6%**（4098 → 2597）。
- **组合**：输入侧重复上下文由 Headroom 转前缀缓存（约 1/10 价），输出侧由 caveman 砍 ~37%，二者打在不同层可同时开。

> 想最大化省费，**稳定系统提示让 Headroom 冻结前缀缓存**比 caveman 档位更关键；长期会话 + 固定系统提示收益最大。

### 启动注意（重要）

代理启动**必须显式带 `--openai-api-url https://api.deepseek.com`**，否则
`/v1/chat/completions` 路由会回落到默认的 `https://api.openai.com`，境内 DNS 解析失败 → 走该路由的请求全部 502。
推荐启动命令：

```bash
headroom.exe proxy --port 8787 \
  --anthropic-api-url https://api.deepseek.com/anthropic \
  --openai-api-url https://api.deepseek.com \
  --host 127.0.0.1 \
  --connect-timeout-seconds 15 --request-timeout-seconds 120 \
  --log-file ~/.headroom/logs/proxy.log
```

## 上游致谢

压缩引擎为 [Headroom](https://github.com/headroomlabs-ai/headroom)
（Apache-2.0），本插件仅做集成与管理，详见 NOTICE。
