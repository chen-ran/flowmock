# FlowMock

[English](README.md) | 简体中文

FlowMock 是一个 LLM API 模拟服务，用于开发调试、鲁棒性测试和压力测试。它通过录制代理采集真实的模型流量，再以可调的首 token 时间（TTFT）、输出速度、网络状况和故障回放：429、流中错误事件、连接重置、挂起、被截断的响应体等。客户端和 Agent 框架因此可以在真实乃至恶劣的上游条件下得到验证，而不必消耗 token。

任何通过标准 LLM API 调用模型的客户端，只需要换一个 base URL 和 API key 即可接入。

> **状态：** 服务端已经可以使用，包括录制、回放、场景、管理 API 和指标。目前还没有 Web UI，相关计划见 [`docs/superpowers/plans`](docs/superpowers/plans)。

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [接入客户端](#接入客户端)
- [基本概念](#基本概念)
- [典型流程](#典型流程)
- [场景](#场景)
- [配置](#配置)
- [查看回放过程](#查看回放过程)
- [管理 API](#管理-api)
- [数据与迁移](#数据与迁移)
- [已知限制](#已知限制)
- [开发](#开发)
- [路线图](#路线图)
- [许可证](#许可证)

## 特性

- **四种协议**：Anthropic Messages、OpenAI Chat Completions、OpenAI Responses（HTTP SSE 与 WebSocket，支持 `previous_response_id` 多轮），以及 Gemini `generateContent` / `streamGenerateContent`（`alt=sse` 与 JSON 数组流）。
- **基于录制，而非编造**：响应体、错误体、错误头和流中错误事件都来自真实录制。回放保留上游的原始字节写法，只有场景要求改动的部分才会改写；请求时间线会标明哪些字节是原样录制、改写、重新编码或注入的。
- **录制选取**：按规范化后的对话指纹精确匹配、按最长对话前缀匹配、按 cassette 顺序回放，或按协议、模型、工具和推理特征带种子采样。
- **时序**：按录制间隔回放（可整体缩放），或根据 TTFT 与每秒 token 数的分布（固定值、均匀、正态、以 p50/p95 参数化的对数正态）合成时间表。实际达到的 TTFT 和 TPS 在网络写出时测量。
- **网络**：延迟、慢响应头、逐帧抖动、无声停顿、带宽上限，以及在任意字节边界分片，包括 UTF-8 字符中间和 SSE 行中间。
- **故障**：录制的 HTTP 错误、录制的流中错误事件，`fin`、`abort`、`reset`、`hang`、`ws_close`、`ws_terminate` 等中断方式，以及按 key 的并发上限；可按调用序号、每 N 次、概率、时间窗口或请求特征触发。
- **可复现**：所有随机选择都由种子派生，相同的 `x-flowmock-seed` 会重放出相同的过程。
- **可扩展**：变换是带有独立 zod schema 的注册模块，按内容、时序、故障、网络四个阶段组合。

## 快速开始

需要 Node.js 22.19 及以上版本和 pnpm 10。

```bash
git clone https://github.com/chen-ran/flowmock.git
cd flowmock
pnpm install
pnpm start -- --config examples/flowmock.yaml
```

示例配置会导入一份小型演示语料（即仓库的测试样本），并绑定四个 mock key，因此不需要任何上游访问即可使用：

| Key | 场景 | 效果 |
|---|---|---|
| `fm-demo-replay` | `default` | 按录制原样回放 |
| `fm-demo-weak-network` | `weak-network-429` | 慢速、抖动、分片的链路，偶有停顿；每个会话第 3 次调用返回 429 |
| `fm-demo-slow-reasoning` | `slow-reasoning` | 首 token 很慢（中位数 8 秒），输出速度一般 |
| `fm-demo-chaos` | `chaos` | 按调用序号轮流出现 529、流中错误、abort 和 hang |

```bash
# Anthropic Messages，按录制时序流式返回
curl -N http://127.0.0.1:8787/v1/messages \
  -H 'x-api-key: fm-demo-replay' -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-5","max_tokens":256,"stream":true,"messages":[{"role":"user","content":"Say hello"}]}'

# OpenAI Chat Completions，经过弱网
curl -N http://127.0.0.1:8787/v1/chat/completions \
  -H 'authorization: Bearer fm-demo-weak-network' -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}'
```

演示语料很小，没见过的问题会采样一条相近的录制来回答。要得到有意义的回放，请录制你自己的流量（见[典型流程](#典型流程)）。

## 接入客户端

| 协议 | Base URL | 凭据 |
|---|---|---|
| Anthropic Messages | `http://127.0.0.1:8787` | `x-api-key` 或 `Authorization: Bearer` |
| OpenAI Chat Completions、Responses | `http://127.0.0.1:8787/v1` | `Authorization: Bearer` |
| Responses over WebSocket | `ws://127.0.0.1:8787/v1/responses` | 升级请求中的 `Authorization: Bearer` |
| Gemini | `http://127.0.0.1:8787`（`/v1beta/models/...`） | `x-goog-api-key` 或 `?key=` |

```ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const anthropic = new Anthropic({ apiKey: 'fm-demo-replay', baseURL: 'http://127.0.0.1:8787' });
const openai = new OpenAI({ apiKey: 'fm-demo-replay', baseURL: 'http://127.0.0.1:8787/v1' });
const gemini = new GoogleGenAI({ apiKey: 'fm-demo-replay', httpOptions: { baseUrl: 'http://127.0.0.1:8787' } });
```

命令行 Agent 也用同样的方式指向 FlowMock，例如 Claude Code：

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 ANTHROPIC_API_KEY=fm-demo-replay claude
```

以及 Codex（`~/.codex/config.toml`）：

```toml
model_provider = "flowmock"

[model_providers.flowmock]
name = "FlowMock"
base_url = "http://127.0.0.1:8787/v1"
env_key = "FLOWMOCK_KEY"
wire_api = "responses"
```

FlowMock 还提供 `GET /v1/models`（OpenAI 与 Anthropic 两种格式）、`GET /v1beta/models`、`POST /v1/messages/count_tokens` 和 Gemini 的 `:countTokens`；回放模式下返回的 token 数是估算值。

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

## 典型流程

**1. 录制。** 把上游凭据交给 FlowMock，并将一个 key 绑定到该目标：

```yaml
# flowmock.yaml
targets:
  - id: anthropic
    baseUrl: https://api.anthropic.com
    headers: { x-api-key: "${ANTHROPIC_API_KEY}" }
keys:
  - { key: fm-record-anthropic, record: anthropic }
  - { key: fm-replay-anthropic, replay: default }
```

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm start -- --config flowmock.yaml
```

让客户端以 `fm-record-anthropic` 访问 FlowMock。请求会逐字节转发，响应边到达边回传，完成后落盘，并按会话归入 cassette。`${NAME}` 占位符从环境变量展开；目标的密钥只保存在本地 SQLite 数据库中，管理 API 返回时会打码。

**2. 查看。** `GET /api/cassettes` 列出各次运行，`GET /api/recordings/<id>` 展示单条录制的请求、解码后的帧和时序。

**3. 回放。** 把客户端的 key 换成 `fm-replay-anthropic`。`default` 场景会用同一对话（或共享前缀最长）的录制回答每个请求，找不到时再采样。要按原顺序精确重跑一次运行，使用顺序回放场景：

```yaml
name: rerun
selection: { mode: sequence, cassette: cas_..., onEnd: error }
```

**4. 制造问题。** 为客户端必须扛住的情况编写场景，并通过 key、请求头或模型名后缀选择它们。

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

未设置 `FLOWMOCK_ADMIN_KEY` 时管理 API 不设防，因此 FlowMock 拒绝监听回环地址以外的接口。

`flowmock.yaml` 包含 `targets`、`keys`、`scenarios`（内联）、`scenarioDir`（场景文件目录）和 `corpus`（启动时导入的语料导出文件）。每次启动都会写入或更新这些条目；通过 API 创建的条目不受影响。示例见 [`examples/flowmock.yaml`](examples/flowmock.yaml)。

## 查看回放过程

每个请求都会进入请求时间线，包含选取方式、命中的故障、每个变换的来源记录、逐帧来源，以及计划时序与实测时序的对比：

```bash
curl -s 'http://127.0.0.1:8787/api/requests?limit=5'
```

场景可以在不发送任何内容的情况下试运行：预览会返回将被选中的录制、命中的故障、每次写出及其时间，以及预期的 TTFT 和 TPS。

```bash
curl -s http://127.0.0.1:8787/api/scenarios/weak-network-429/preview \
  -H 'content-type: application/json' \
  -d '{"protocol":"openai-chat-completions","callIndex":3,"body":{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}}'
```

`/metrics` 提供 Prometheus 指标：按协议、模式和结果分类的请求数、注入的故障、录制数，以及实测 TTFT 与 TPS 的直方图。

## 管理 API

所有路由都在 `/api` 下；设置了 `FLOWMOCK_ADMIN_KEY` 时需要携带 `Authorization: Bearer $FLOWMOCK_ADMIN_KEY`。

| 路由 | 用途 |
|---|---|
| `GET /recordings`、`GET /recordings/:id`、`GET /recordings/:id/body`、`DELETE /recordings/:id` | 浏览语料，包括解码后的帧。过滤参数：`protocol`、`model`、`outcome`、`cassette`、`session`、`limit`、`offset`。 |
| `GET /cassettes`、`GET/PATCH/DELETE /cassettes/:id` | 录制会话；`closed: true` 使下一次请求开启新 cassette；`DELETE ?recordings=true` 同时删除其中的录制。 |
| `GET /scenarios`、`GET/PUT/DELETE /scenarios/:name` | 场景；`PUT` 接受 YAML 或 JSON。 |
| `POST /scenarios/:name/preview`、`POST /scenarios/:name/reset` | 不发送请求地生成回放计划；清空调用计数和时间窗口起点。 |
| `GET/POST /keys`、`DELETE /keys/:key` | Key 绑定。 |
| `GET/POST /targets`、`DELETE /targets/:id` | 录制目标（密钥打码）。 |
| `GET /requests`、`GET /requests/:id` | 请求时间线。 |
| `GET /export`、`POST /import` | 可移植的 NDJSON 语料。 |
| `GET /schema/scenario`、`GET /transforms` | 供编辑器使用的 schema。 |
| `GET /health` | 版本与存活状态。 |

## 数据与迁移

- `data/flowmock.db` 是 SQLite 数据库（录制、cassette、场景、key、目标）；`data/chunks/` 保存每条录制的响应体数据块及其到达时间。
- `GET /api/export` 把语料（或用 `?cassette=` 指定的单个 cassette）导出为按行分隔的 JSON；`POST /api/import` 和 `flowmock.yaml` 的 `corpus` 配置可以导入它。导入保留原 id，重复导入不会产生副本。`examples/demo-corpus.generated.ndjson` 就是这样一个文件。

## 已知限制

- 还没有 Web UI。
- 请求时间线只保存在内存中（最近 1000 个请求）。
- 既没有匹配的错误录制、也没有显式 `status` 时，错误类故障会报告缺少样本，而不是合成错误。
- 流式请求无法由非流式录制来回答。
- Responses 的 `previous_response_id` 续写按宽松方式处理：未知 id 不会导致请求失败。
- 限流只有并发上限，RPM 与 TPM 限流尚在计划中。
- 丢包、重传等包级网络损伤不在模拟范围内，需要时可在 FlowMock 前面叠加 toxiproxy 或 `tc`。

## 开发

```bash
pnpm run verify   # lint、类型检查和全部测试
```

| 路径 | 职责 |
|---|---|
| `packages/protocols` | 四种协议的线格式类型、SSE 与 JSON 数组解码器、流解析器和 collect reducer。 |
| `packages/core` | 与运行时无关的引擎：语料分析、请求规范化与指纹、录制选取、变换、回放计划与执行器。 |
| `packages/test-fixtures` | 各测试套件共享的真实录制样本。 |
| `packages/ui` | 浏览器端 UI 基础：重塑为 WinUI 3 风格的 Fluent UI、通用控件、懒加载的编辑器、图表、类型化 i18n 边界，以及管理 Web 应用使用的构建辅助。 |
| `apps/server` | Node 服务端：数据面、录制代理、WebSocket Responses、SQLite 存储、管理 API。 |
| `examples` | 示例配置、场景和演示语料。 |

集成测试绑定真实 socket，并使用官方 Anthropic、OpenAI 和 Google GenAI SDK 驱动 FlowMock。面向贡献者和编码 Agent 的仓库规则见 [AGENTS.md](AGENTS.md)。

## 路线图

后续工作的计划见 [`docs/superpowers/plans`](docs/superpowers/plans)：

1. 控制面：浏览器会话、通过 SSE 推送的实时指标、可持久化的时间线、托管 Web 应用的静态资源、优雅停机。
2. 保真度与变换：按协议合成错误、由非流式录制合成流式响应、按 token 截断、文本与工具名改写、模板响应、`previous_response_not_found`、RPM/TPM 限流。
3. UI 包（已完成）：管理 Web 应用所需的 WinUI 层、控件、编辑器、图表与类型化 i18n；接下来是管理 Web 应用本身。
4. 跨协议回放、多核压测与 Docker 镜像。

## 许可证

MIT。FlowMock 的部分代码移植自 [Floway](https://github.com/Menci/Floway)，详见 [NOTICE.md](NOTICE.md)。
