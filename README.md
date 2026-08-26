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

## 上游致谢

压缩引擎为 [Headroom](https://github.com/headroomlabs-ai/headroom)
（Apache-2.0），本插件仅做集成与管理，详见 NOTICE。
