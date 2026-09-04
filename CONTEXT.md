# dsh-headroom-suite — 领域术语表

本文件只记录领域词汇的规范含义，不含实现细节。

## 线路（route）

客户端（如 DSH 的 `llm-deepseek` 设置）实际把请求发往的目标，由 baseURL 字段指向。三态：

- **直连线路（direct）**：baseURL 为 `undefined`、空白，或等于 DeepSeek 官方端点（`https://api.deepseek.com` 的 `/v1`、尾斜杠与 `/anthropic` 拼写变体均视为官方端点）。请求直发 DeepSeek，不经代理。
- **压缩线路（headroom）**：baseURL 指向本地 Headroom 压缩代理。请求先经代理，再按代理的「上游」转发。
- **第三方直发线路（third-party）**：baseURL 为某个第三方地址，请求直发该地址，不经代理。

_Avoid_: 单独说「第三方线路」——既可指本条目，也可误指「第三方上游」，有歧义。

## 上游（upstream）

Headroom 代理进程把收到的请求转发到的目标。与线路正交。两态：

- **官方上游（official upstream）**：DeepSeek 官方端点；代理同时服务 OpenAI 与 Anthropic（Claude Code）两种协议路线。
- **第三方上游（third-party upstream）**：第三方地址作为转发目标；代理只服务 OpenAI 协议路线，不支持 Claude Code。

## 期望上游（expected upstream）

启动代理进程时推导出的上游目标。启动时刻的推导次序：当前 baseURL 是第三方地址时，该地址为第三方上游；否则当 baseURL 在压缩线路且「保存文件」含合法第三方地址时，以保存文件中的地址为第三方上游；两者皆无时为官方上游。推导只发生在启动瞬间，已在运行的代理不会自动换上游。

## 第三方地址（third-party baseURL）

DeepSeek 官方端点与压缩线路地址以外的 http(s) 地址。同一值兼有两种身份：作为 baseURL 时是「第三方直发线路」的目标；作为「期望上游」时是「第三方上游」的转发目标。

_Avoid_: 不指明场合地混用「baseURL」「上游」两个词。

## 切换（switch）

在直连线路与压缩线路之间改 `llm-deepseek.baseURL` 的动作，热生效。

## 保存文件（sidecar）

切到压缩线路前，若当前 baseURL 是第三方地址，把该地址写出的独立文件；切回直连时读取、恢复并删除。压缩线路上存在保存文件时，启动代理的期望上游取其中的地址。该文件的术语名是「保存文件」，不属于设置文档本身。
