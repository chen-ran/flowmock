# FlowMock

[English](README.md) | 简体中文

FlowMock 是一个 LLM API 录制与回放模拟器。它通过代理录下真实的模型流量，再按场景设定的时序、网络状况和故障回放出来，让客户端和编码 Agent 在真实乃至恶劣的上游条件下得到检验，而不必花一个 token。

![场景编辑器](docs/images/scenario-editor.png)

## 特性

- 录制并回放 Anthropic Messages、OpenAI Chat Completions、OpenAI Responses（HTTP 与 WebSocket）和 Gemini，保留上游的原始字节。
- 用同一对话的录制、共享前缀最长的录制、录制会话中的下一步，或带种子的采样来回答每个请求。
- 按录制的时序原样或缩放回放，也可以从首 token 时间和输出速度的分布中抽取时序。
- 用延迟、抖动、静默停顿、带宽上限，以及能切开 UTF-8 字符和 SSE 行的分片来削弱链路。
- 按调用序号、每 N 次、概率或时间窗口，注入录制的 429 与流中错误、提前 FIN、中止、TCP 重置、挂起或 WebSocket 关闭。
- 精确重放任意一次回放：所有随机选择都由 `x-flowmock-seed` 派生。
- 在中英文双语的管理平台里管理录制、场景、key、实时指标和每个请求的追踪。

## 快速开始

需要 Node.js 22.19 及以上版本和 pnpm 10。

```bash
git clone https://github.com/chen-ran/flowmock.git
cd flowmock
pnpm install
pnpm run build:web
pnpm start -- --config examples/flowmock.yaml
```

打开 <http://127.0.0.1:8787>。示例配置会导入一份小型演示语料并绑定四个 mock key，不需要任何上游访问即可使用：

| Key | 场景 | 效果 |
|---|---|---|
| `fm-demo-replay` | `default` | 按录制原样回放 |
| `fm-demo-weak-network` | `weak-network-429` | 慢速、抖动、分片且偶有停顿的链路，每个会话第 3 次调用返回 429 |
| `fm-demo-slow-reasoning` | `slow-reasoning` | 首 token 很慢，输出速度一般 |
| `fm-demo-chaos` | `chaos` | 轮流出现 529、流中错误、中止和挂起 |

然后：

1. 用其中一个 key 发一个请求：

   ```bash
   curl -N http://127.0.0.1:8787/v1/messages \
     -H 'x-api-key: fm-demo-weak-network' -H 'content-type: application/json' \
     -d '{"model":"claude-sonnet-4-5","max_tokens":256,"stream":true,"messages":[{"role":"user","content":"Say hello"}]}'
   ```

2. 在 **请求** 和 **实时监控** 里看到它。
3. 在 **场景** 里打开一个场景，修改后先对任意一条录制的请求预览效果，再保存。

## 接入客户端

客户端沿用自己的 SDK，只需换掉 base URL 和 API key：

| API | Base URL | 凭据 |
|---|---|---|
| Anthropic Messages | `http://127.0.0.1:8787` | `x-api-key` 或 `Authorization: Bearer` |
| OpenAI Chat Completions 与 Responses | `http://127.0.0.1:8787/v1` | `Authorization: Bearer` |
| 基于 WebSocket 的 OpenAI Responses | `ws://127.0.0.1:8787/v1/responses` | `Authorization: Bearer` |
| Gemini | `http://127.0.0.1:8787` | `x-goog-api-key` 或 `?key=` |

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 ANTHROPIC_API_KEY=fm-demo-replay claude
```

**Key 与目标 → 客户端配置** 会为 Anthropic、OpenAI、Google GenAI 的 SDK 以及 curl、Claude Code 和 Codex 生成同样的配置。

## 录制、回放、制造故障

**录制。** 给 FlowMock 一个上游，并把一个 key 绑定到它。请求原样转发，响应边到达边回传，每个数据块的到达时间都会存下来，每个客户端会话归入一个 cassette：

```yaml
# flowmock.yaml
targets:
  - id: anthropic
    baseUrl: https://api.anthropic.com
    headers: { x-api-key: "${ANTHROPIC_API_KEY}" }
keys:
  - { key: fm-record-anthropic, record: anthropic }
  - { key: fm-replay-anthropic, replay: weak-network-429 }
```

**回放。** 把客户端换成绑定到某个场景的 key，配置的其他部分都不用动。

**制造故障。** 场景决定回放如何选取录制、如何安排时序、经过怎样的链路、注入哪些故障：

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

错误体和流中错误来自录制或场景本身，绝不凭空编造。[`examples/scenarios`](examples/scenarios) 中的场景可以作为起点。单个请求可以用 `x-flowmock-scenario` 换用其他场景，用 `x-flowmock-session` 指定会话；无法添加请求头时，也可以请求 `"model": "<模型>@<场景>"`。

## 管理平台

服务在 `/` 提供管理平台，覆盖管理 API 的全部功能，并跟随系统的亮色或暗色外观。设置了 `FLOWMOCK_ADMIN_KEY` 时，只需输入一次。

| | |
|---|---|
| ![概览](docs/images/overview.png) | ![实时监控](docs/images/live-monitor.png) |

![一次回放的追踪，以及计划与实测时序的对比](docs/images/request-trace.png)

## 配置

| 参数 | 环境变量 | 默认值 | 含义 |
|---|---|---|---|
| `--host` | `FLOWMOCK_HOST` | `127.0.0.1` | 监听地址 |
| `--port` | `FLOWMOCK_PORT` | `8787` | 端口 |
| `--data` | `FLOWMOCK_DATA_DIR` | `./data` | SQLite 数据库与录制数据块 |
| `--config` | `FLOWMOCK_CONFIG` | 无 | 启动时应用的 `flowmock.yaml` |
| | `FLOWMOCK_ADMIN_KEY` | 无 | 保护 `/api` 与 `/metrics`；监听回环以外的地址时必须设置 |

`flowmock.yaml` 包含目标、key、场景和要导入的语料文件，示例见 [`examples/flowmock.yaml`](examples/flowmock.yaml)。场景格式、管理 API、Prometheus 指标、存储与已知限制见[参考文档](docs/reference_CN.md)。

## 开发

```bash
pnpm install
pnpm start -- --config examples/flowmock.yaml   # 服务端
pnpm run dev:web                                # 管理平台，监听 5175 端口
pnpm run verify
```

`verify` 依次运行 lint、类型检查、全部测试，以及带产物检查的 Web 构建，CI 运行的正是它。集成测试绑定真实 socket，并用官方 Anthropic、OpenAI 和 Google GenAI SDK 驱动 FlowMock。[AGENTS.md](AGENTS.md) 规定了仓库规则，并索引了各个包。

## 许可证

MIT

## Floway 的姐妹项目

FlowMock 是 [Floway](https://github.com/Menci/Floway) 的姐妹项目。Floway 是面向编码 Agent 和 API 客户端的自托管 LLM API 网关：Floway 把你的 Agent 流量送到真实的模型，FlowMock 把这些流量录下来，在你测试时按你的设定回放。两者共用一套 WinUI 风格的界面，FlowMock 的部分代码移植自 Floway，详见 [NOTICE.md](NOTICE.md)。
