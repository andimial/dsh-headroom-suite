# dsh-headroom-suite — 领域术语表

本文件只记录领域词汇的规范含义，不含实现细节。

## 线路（route）

`llm-deepseek` 命名空间 `baseURL` 字段所指向的请求路径。当前取值为三态之一：

- **直连线路（direct）**：`baseURL` 为 `undefined`、空白，或等于 DeepSeek 官方端点（`https://api.deepseek.com` 的 `/v1`、尾斜杠与 `/anthropic` 拼写变体均视为官方端点）。
- **压缩线路（headroom）**：`baseURL` 指向本地 Headroom 压缩代理。
- **第三方地址（third-party baseURL）**：除上述两值以外的任意 `baseURL`。

## 切换（switch）

在直连线路与压缩线路之间改 `llm-deepseek.baseURL` 的动作，热生效。

## 保存文件（sidecar）

切换到压缩线路前，若当前是第三方地址，把该地址写出的独立文件；切回直连时读取、恢复并删除。该文件的术语名是「保存文件」，不属于设置文档本身。
