# FlowMock 参考

[English](reference.md) | 简体中文

[README](../README_CN.md) 背后的细节：基本概念、场景格式、配置、管理 API、存储与已知限制。

## 基本概念

- **录制（recording）**：一次完整交换，包括请求（鉴权信息已脱敏）、响应状态与响应头，以及每个响应体数据块和它的到达时间。由此派生的特征驱动录制选取：结果分类（`ok`、`http_error:429`、`stream_error:overloaded_error`、`truncated`、`client_aborted`）、token 数、停止原因、工具调用、推理、实测 TTFT 与 TPS。
- **Cassette**：一次客户端运行中按顺序排列的录制，每个录制 key 与会话对应一个。会话空闲 30 分钟，或通过 API 关闭当前 cassette 后，下一次请求会开启新的 cassette。
- **会话（session）**：由 `x-flowmock-session` 指定；未指定时由对话的系统提示词与首条消息派生，因此同一任务的两次运行属于同一会话，而并行运行的不同任务彼此独立。
- **场景（scenario）**：决定回放如何选取录制、如何安排时序、施加什么网络条件、注入什么故障。
- **Mock key**：绑定为 `record: <目标>` 或 `replay: <场景>`。在录制和回放之间切换时，客户端配置不需要任何改动。

单次请求的覆盖方式：

| 覆盖 | 作用 |
|---|---|
| `x-flowmock-scenario: <名称>` | 本次请求使用另一个场景 |
| `x-flowmock-seed: <种子>` | 为所有随机选择设定种子，同一种子重放出同样的过程 |
| `x-flowmock-session: <id>` | 指定会话（调用计数、cassette 归档、顺序回放） |
| `model: "<模型>@<场景>"` | 客户端无法添加请求头时，用模型名后缀选择场景 |

## 场景

```yaml
name: weak-network-429
selection: { mode: match-then-sample, sample: { outcome: ok, seed: 42 } }
timing:
  mode: synthetic
  ttftMs: { dist: lognormal, p50: 800, p95: 3000 }
  tps: { dist: normal, mean: 60, sd: 10 }
network:
  latencyMs: 80
  jitterMs: 40
  bandwidthKBps: 32
  fragmentation: { maxBytes: 7 }
  stalls: { probability: 0.02, durationMs: [2000, 20000] }
faults:
  - when: { callIndex: 3 }
    inject: { type: http_error, from: { outcome: "http_error:429" }, headers: { retry-after: "2" } }
  - when: { probability: 0.05 }
    inject: { type: interrupt, at: { fraction: 0.4 }, mode: reset }
```

| 字段 | 控制内容 |
|---|---|
| `selection` | `match`（先精确匹配，再匹配共享至少 `minPrefix` 个片段的最长前缀）、`sequence`（cassette 中的位置等于调用序号；`onEnd: error \| loop \| last \| sample`）、`sample`（带种子采样，按模型、工具兼容性、推理和输入规模打分；`strict` 把打分项变为硬过滤；`models` 把请求的模型映射到录制的模型），或 `match-then-sample`（默认）。`outcomes` 列出 match 与 sample 可以返回的结果分类（默认 `ok`）。 |
| `rewrite` | 一致地改写 response、message、item 与工具调用的 id（保持前缀、长度和字符集）、模型名（`auto` 仅在客户端请求的模型与录制不同时改写）以及时间戳。 |
| `fidelity` | `raw` 逐字节回放录制的数据块，跳过所有改写。 |
| `timing` | `recorded` 配合 `scale`，或 `synthetic` 配合 `ttftMs`、`tps`、`jitterMs`。分布可以是一个数字，也可以是 `{ dist: fixed \| uniform \| normal \| lognormal, ... }`。 |
| `network` | `latencyMs`、`headersDelayMs`、`jitterMs`（逐帧）、`bandwidthKBps`、`fragmentation`（`maxBytes`、`minBytes`、`gapMs`）、`stalls`（逐帧）。 |
| `faults` | 由 `when` 与 `inject` 组成的规则列表，命中的第一条规则生效。`when`：`callIndex`（数字、列表或 `{ from, to }`）、`everyN`、`probability`、`window`（`startMs`、`endMs`、`periodMs`）、`model`、`stream`、`hasTools`、`protocol`。`inject`：`http_error`、`stream_error_event`、`interrupt`（`at: { fraction \| frame \| afterMs }`，`mode: fin \| abort \| reset \| hang \| ws_close \| ws_terminate`）、`concurrency_limit`（`max`）。 |
| `transforms` | 额外的已注册变换，写作 `{ type, ...配置 }`。 |

错误体和流中错误事件来自 `from` 选出的录制（结果分类通配、模型或录制 id），`status`、`headers`、`body` 以及内联的 `event` 可以覆盖它们。既没有匹配的录制、也没有覆盖时，FlowMock 会返回自己的诊断错误，而不是凭空编造一个。

`examples/scenarios` 中是四个演示场景。`GET /api/schema/scenario` 提供可用于编辑器的 JSON Schema。

## 配置

| 参数 | 环境变量 | 默认值 | 含义 |
|---|---|---|---|
| `--host` | `FLOWMOCK_HOST` | `127.0.0.1` | 监听地址 |
| `--port` | `FLOWMOCK_PORT` | `8787` | 端口 |
| `--data` | `FLOWMOCK_DATA_DIR` | `./data` | 数据库与录制数据块目录 |
| `--config` | `FLOWMOCK_CONFIG` | 无 | 启动时应用的 `flowmock.yaml` |
| | `FLOWMOCK_ADMIN_KEY` | 无 | `/api` 与 `/metrics` 的 Bearer 令牌 |
| | `FLOWMOCK_TIMELINE_PERSIST` | `0` | 把请求时间线保存到 SQLite（`1` 开启） |
| | `FLOWMOCK_TIMELINE_RETAIN_DAYS` | `7` | 持久化时间线的保留天数 |
| | `FLOWMOCK_TIMELINE_MAX` | `100000` | 持久化时间线的最大条目数 |
| | `FLOWMOCK_WEB_DIST_DIR` | `../web/dist/client` | 管理 Web 应用的构建目录，相对于 `apps/server` |
| | `FLOWMOCK_SHUTDOWN_GRACE_MS` | `10000` | 停机时等待 HTTP 与 WebSocket 流结束的时间 |

未设置 `FLOWMOCK_ADMIN_KEY` 时管理 API 不设防，因此 FlowMock 拒绝监听回环地址以外的接口。

`flowmock.yaml` 包含 `targets`、`keys`、`scenarios`（内联）、`scenarioDir`（场景文件目录）和 `corpus`（启动时导入的语料导出文件）。每次启动都会写入或更新这些条目；通过 API 创建的条目不受影响。场景文件按原文保存（包括注释），除非其中的值引用了环境变量。示例见 [`examples/flowmock.yaml`](../examples/flowmock.yaml)。

运行时设置也可以写在 YAML 中，环境变量优先：

```yaml
timeline: { persist: true, retainDays: 7, maxEntries: 100000 }
webDistDir: ../web/dist/client
shutdownGraceMs: 10000
```

收到 SIGINT 或 SIGTERM 时，FlowMock 停止接受新请求并等待进行中的流结束；到期仍未结束的交互会在 SQLite 关闭前保存为 `truncated`。第二个信号会立即退出。管理 Web 应用的 GET/HEAD 路由提供静态构建并回退到 SPA 入口；`/assets/` 下的文件使用不可变缓存，API 与数据面路径始终交给服务端处理。缺少构建产物时，应用路由返回 503。

## 查看回放过程

每个请求都会进入请求时间线，包含选取方式、命中的故障、每个变换的来源记录、逐帧来源，以及计划时序与实测时序的对比：

```bash
curl -s 'http://127.0.0.1:8787/api/requests?limit=5'
```

场景可以在不发送任何内容的情况下试运行：预览会返回将被选中的录制、命中的故障、每次写出及其时间，以及预期的 TTFT 和 TPS。传入 `source` 可以用未保存的 YAML 代替已保存的场景进行预览。

```bash
curl -s http://127.0.0.1:8787/api/scenarios/weak-network-429/preview \
  -H 'content-type: application/json' \
  -d '{"protocol":"openai-chat-completions","callIndex":3,"body":{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}}'
```

`/metrics` 提供 Prometheus 指标：按协议、模式和结果分类的请求数、注入的故障、录制数，以及实测 TTFT 与 TPS 的直方图。

## 管理 API

所有路由都在 `/api` 下。设置了 `FLOWMOCK_ADMIN_KEY` 时，用 `Authorization: Bearer <admin-key>` 或 `x-flowmock-admin-session: <token>` 认证。`GET /api/health` 和 `POST /api/auth/login` 无需认证。登录用 `{ "key": "<admin-key>" }` 换取 `{ token, expiresAt }`，服务端只保存 token 的 SHA-256 哈希；会话有效期为滑动的七天，登出即吊销。未配置 admin key 时，回环地址上任意非空 key 都能登录，不带凭据的请求在 `/api/auth/me` 中报告为 `open`。

```bash
curl -s http://127.0.0.1:8787/api/auth/login \
  -H 'content-type: application/json' -d '{"key":"your-admin-key"}'
# 把返回的 token 放进 admin 会话头。
curl -N http://127.0.0.1:8787/api/live \
  -H 'x-flowmock-admin-session: <token>'
```

被拒绝的场景返回 400：字段无效时附带 `error.issues`（每项包含指向文档的 `path` 和 `message`），文本不是合法 YAML 时附带 `error.position`（`line`、`col`）。

`GET /api/live` 每秒发送 `snapshot` 事件，包含进行中的请求数、最近十秒的完成速率，以及最近六十秒按协议统计的请求与错误数、故障数和 TTFT/TPS 分位数。`GET /api/requests/stream` 在新增追踪时发送精简的 `request` 事件。两个流每十五秒发送保活注释，并接受 `?session=<token>` 以便浏览器的 EventSource 使用；查询参数中的凭据只在这两个 GET 路由上有效。数据面请求头 `x-flowmock-session` 命名的是回放/录制会话，与管理认证无关。

| 路由 | 用途 |
|---|---|
| `POST /auth/login`、`GET /auth/me`、`DELETE /auth/session` | 登录、查看认证方式、吊销当前管理会话。 |
| `GET /settings` | 版本、API 是否由 admin key 保护，以及时间线的保存方式。 |
| `GET /recordings`、`GET /recordings/:id`、`GET /recordings/:id/body`、`DELETE /recordings/:id` | 浏览语料，包括解码后的帧。过滤参数：`protocol`、`model`、`outcome`、`cassette`、`session`、`q`（不区分大小写的响应体子串）、`before`（录制 id）、`limit`、`offset`。 |
| `POST /recordings/delete` | 在一个数据库事务中删除 `{ ids: [...] }`，移除数据块文件并返回 `{ deleted }`。 |
| `GET /stats` | 录制总数与响应体字节数，以及 `byProtocol`、`byOutcome`、`byModel` 分组的数量与字节数。 |
| `GET /cassettes`、`GET/PATCH/DELETE /cassettes/:id` | 录制会话；`closed: true` 使下一次请求开启新 cassette；`DELETE ?recordings=true` 同时删除其中的录制。 |
| `GET /scenarios`、`GET/PUT/DELETE /scenarios/:name` | 场景；`PUT` 接受 YAML 或 JSON。 |
| `POST /scenarios/:name/preview`、`POST /scenarios/:name/reset` | 按已保存的场景或未保存的 `source` 生成回放计划而不发送请求；清空调用计数和时间窗口起点。 |
| `GET/POST /keys`、`DELETE /keys/:key` | Key 绑定。 |
| `GET/POST /targets`、`DELETE /targets/:id` | 录制目标（密钥打码）。值为 `null` 的请求头保留该名称下已保存的值。 |
| `GET /requests`、`GET /requests/:id` | 请求时间线，过滤参数：`before`、`limit`、`mode`、`key`（key 名称）、`protocol`、`outcome`、`status`（`2xx`、`3xx`、`4xx`、`5xx`）。 |
| `GET /live`、`GET /requests/stream` | 通过 SSE 推送的实时指标与已完成请求的摘要。 |
| `GET /export`、`POST /import` | 可移植的 NDJSON 语料。 |
| `GET /schema/scenario`、`GET /transforms` | 供编辑器使用的 schema。 |
| `GET /health` | 版本与存活状态。 |

## 数据与迁移

- `data/flowmock.db` 是 SQLite 数据库（录制、cassette、场景、key、目标）；`data/chunks/` 保存每条录制的响应体数据块及其到达时间。
- `GET /api/export` 把语料（或用 `?cassette=` 指定的单个 cassette）导出为按行分隔的 JSON；`POST /api/import` 和 `flowmock.yaml` 的 `corpus` 配置可以导入它。导入保留原 id，重复导入不会产生副本。`examples/demo-corpus.generated.ndjson` 就是这样一个文件。

## 已知限制

- 请求时间线默认在内存中保存最近 1000 个请求。可选的 SQLite 持久化使其跨重启保留，每条追踪最多保存 500 个帧摘要，过期条目在启动时和每十分钟清理一次。
- 既没有匹配的错误录制、也没有显式 `status` 时，错误类故障会报告缺少样本，而不是合成错误。
- 流式请求无法由非流式录制来回答。
- Responses 的 `previous_response_id` 续写按宽松方式处理：未知 id 不会导致请求失败。
- 限流只有并发上限，RPM 与 TPM 限流尚在计划中。
- 丢包、重传等包级网络损伤不在模拟范围内，需要时可在 FlowMock 前面叠加 toxiproxy 或 `tc`。
