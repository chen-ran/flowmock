# FlowMock

English | [简体中文](README_CN.md)

FlowMock is an LLM API simulator for development, robustness testing and load
testing. It records real model traffic through a proxy, then replays it with
tunable time-to-first-token, decode speed, network conditions and faults — 429s,
mid-stream error events, connection resets, hangs, truncated bodies — so that
clients and agent frameworks can be exercised against realistic and adversarial
upstreams without spending tokens.

Any client that talks to a standard LLM API only needs a different base URL and
API key.

> **Status:** recording, replay, scenarios, the admin API, metrics and the
> management web app are usable today. Further work is planned in
> [`docs/superpowers/plans`](docs/superpowers/plans).

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Management app](#management-app)
- [Connecting clients](#connecting-clients)
- [Concepts](#concepts)
- [A typical workflow](#a-typical-workflow)
- [Scenarios](#scenarios)
- [Configuration](#configuration)
- [Inspecting replays](#inspecting-replays)
- [Admin API](#admin-api)
- [Data and portability](#data-and-portability)
- [Limitations](#limitations)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

## Highlights

- **Four protocols**: Anthropic Messages, OpenAI Chat Completions, OpenAI
  Responses (HTTP SSE and WebSocket, multi-turn with `previous_response_id`),
  and Gemini `generateContent` / `streamGenerateContent` (`alt=sse` and the
  JSON array stream).
- **Recorded, not invented**: bodies, error bodies, error headers and in-stream
  error events come from real recordings. Replays keep the upstream's byte
  spelling; only what a scenario changes is rewritten, and the request timeline
  says which bytes were recorded, rewritten, re-encoded or injected.
- **Selection**: exact match on a normalized conversation fingerprint, longest
  conversation prefix, ordered cassette replay, or seeded sampling by protocol,
  model, tools and reasoning.
- **Timing**: recorded intervals (optionally scaled), or a synthetic schedule
  from a TTFT and a tokens-per-second distribution (fixed, uniform, normal,
  lognormal with p50/p95). The achieved TTFT and TPS are measured on the wire.
- **Network**: latency, slow headers, per-frame jitter, silent stalls, a
  bandwidth limit, and fragmentation at arbitrary byte boundaries — inside
  UTF-8 characters and SSE lines included.
- **Faults**: recorded HTTP errors, recorded stream error events, `fin`,
  `abort`, `reset`, `hang`, `ws_close` and `ws_terminate` interrupts, and a
  per-key concurrency limit, triggered by call number, every N calls,
  probability, time windows or request features.
- **Reproducible**: every random choice derives from a seed; the same
  `x-flowmock-seed` replays the same run.
- **Extensible**: transforms are registered modules with their own zod schema,
  composed in content, timing, fault and network stages.

## Quick start

Requires Node.js 22.19 or later and pnpm 10.

```bash
git clone https://github.com/chen-ran/flowmock.git
cd flowmock
pnpm install
pnpm run build:web   # the management app, served by the server at /
pnpm start -- --config examples/flowmock.yaml
```

The example configuration imports a small demo corpus (the repository's test
fixtures) and binds four mock keys, so FlowMock works without any upstream
access:

| Key | Scenario | Behavior |
|---|---|---|
| `fm-demo-replay` | `default` | Replays recordings as recorded |
| `fm-demo-weak-network` | `weak-network-429` | Slow, jittery, fragmented link with occasional stalls; a 429 on every session's third call |
| `fm-demo-slow-reasoning` | `slow-reasoning` | Long time to first token (median 8 s), modest decode speed |
| `fm-demo-chaos` | `chaos` | 529s, stream errors, aborts and hangs in rotation by call number |

```bash
# Anthropic Messages, streamed with recorded timing
curl -N http://127.0.0.1:8787/v1/messages \
  -H 'x-api-key: fm-demo-replay' -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-5","max_tokens":256,"stream":true,"messages":[{"role":"user","content":"Say hello"}]}'

# OpenAI Chat Completions through a weak network
curl -N http://127.0.0.1:8787/v1/chat/completions \
  -H 'authorization: Bearer fm-demo-weak-network' -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}'
```

The demo corpus is small, so a question it never saw is answered by sampling a
similar recording. Record your own traffic for meaningful replays (see
[A typical workflow](#a-typical-workflow)).

## Management app

Open `http://127.0.0.1:8787` once the app is built. It covers what the admin
API does, in English and Simplified Chinese, following the system's light or
dark scheme:

- **Overview**: the corpus by protocol and outcome, the last minute of
  replays, and the newest requests.
- **Recordings and cassettes**: filter and search the corpus; each recording
  shows its frames, chunks and token curve on one time axis. A cassette can be
  exported, closed, renamed, or turned into a sequence scenario.
- **Scenarios**: edit a scenario as a form or as YAML. The two change the same
  document, so comments and fields the form does not cover survive. The YAML
  editor validates against the server's schema and marks what the server
  refuses. A preview plans any recorded or pasted request against the unsaved
  scenario, for any seed and call number.
- **Keys and targets**: bind mock keys to a scenario or a recording target,
  and copy client configuration for each SDK, Claude Code and Codex.
- **Live monitor**: TTFT and output speed at p50/p90/p99, throughput and
  injected faults over the last ten minutes.
- **Requests**: the timeline as it happens, filterable by mode, key, protocol,
  status and outcome. Each request shows its selection, the fault that fired,
  its frames by origin, planned against measured timing, provenance, and a
  curl that replays it with the same seed.

![Scenario editor](docs/images/scenario-editor.png)

| | |
|---|---|
| ![Overview](docs/images/overview.png) | ![Live monitor](docs/images/live-monitor.png) |
| ![Request trace](docs/images/request-trace.png) | |

With `FLOWMOCK_ADMIN_KEY` set, the app asks for the key once and keeps a
browser session; without it, the app opens directly on loopback. To work on the
app, run the server and `pnpm --filter @flowmock/web dev`. The development
server listens on port 5175 and proxies the API to `FLOWMOCK_DEV_SERVER`
(default `http://127.0.0.1:8787`).

## Connecting clients

| Protocol | Base URL | Credential |
|---|---|---|
| Anthropic Messages | `http://127.0.0.1:8787` | `x-api-key` or `Authorization: Bearer` |
| OpenAI Chat Completions, Responses | `http://127.0.0.1:8787/v1` | `Authorization: Bearer` |
| Responses over WebSocket | `ws://127.0.0.1:8787/v1/responses` | `Authorization: Bearer` on the upgrade |
| Gemini | `http://127.0.0.1:8787` (`/v1beta/models/...`) | `x-goog-api-key` or `?key=` |

```ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const anthropic = new Anthropic({ apiKey: 'fm-demo-replay', baseURL: 'http://127.0.0.1:8787' });
const openai = new OpenAI({ apiKey: 'fm-demo-replay', baseURL: 'http://127.0.0.1:8787/v1' });
const gemini = new GoogleGenAI({ apiKey: 'fm-demo-replay', httpOptions: { baseUrl: 'http://127.0.0.1:8787' } });
```

Command-line agents are pointed at FlowMock the same way, for example Claude
Code:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 ANTHROPIC_API_KEY=fm-demo-replay claude
```

and Codex (`~/.codex/config.toml`):

```toml
model_provider = "flowmock"

[model_providers.flowmock]
name = "FlowMock"
base_url = "http://127.0.0.1:8787/v1"
env_key = "FLOWMOCK_KEY"
wire_api = "responses"
```

FlowMock also serves `GET /v1/models` (OpenAI and Anthropic shapes),
`GET /v1beta/models`, `POST /v1/messages/count_tokens` and Gemini
`:countTokens`; replayed token counts are estimates.

## Concepts

- A **recording** is one exchange: the request (credentials redacted), the
  response status and headers, and every body chunk with its arrival time.
  Derived features — outcome (`ok`, `http_error:429`,
  `stream_error:overloaded_error`, `truncated`, `client_aborted`), tokens, stop
  reason, tool calls, reasoning, measured TTFT and TPS — drive selection.
- A **cassette** is the ordered recordings of one client run: one per recording
  key and session. A session idle for 30 minutes, or a cassette closed through
  the API, starts a new cassette.
- A **session** is named by `x-flowmock-session`, or derived from the
  conversation's system prompt and first message, so two runs of the same task
  share a session while different tasks running side by side do not.
- A **scenario** decides how a replay is selected, timed, shaped and broken.
- A **mock key** is bound to `record: <target>` or `replay: <scenario>`. The
  client never changes its configuration between recording and replaying.

Per-request overrides:

| Override | Effect |
|---|---|
| `x-flowmock-scenario: <name>` | Use another scenario for this request |
| `x-flowmock-seed: <seed>` | Seed every random choice; the same seed replays the same run |
| `x-flowmock-session: <id>` | Name the session (call counters, cassettes, sequence replay) |
| `model: "<model>@<scenario>"` | Select a scenario when the client cannot send headers |

## A typical workflow

**1. Record.** Give FlowMock the upstream credentials and bind a key to the
target:

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

Run your client against FlowMock with `fm-record-anthropic`. Requests are
forwarded byte for byte, streamed back as they arrive, and stored once
complete, grouped into a cassette per session. `${NAME}` placeholders expand
from the environment; target secrets stay in the local SQLite database and are
masked by the admin API.

**2. Inspect.** `GET /api/cassettes` lists the runs, `GET /api/recordings/<id>`
shows a recording's request, decoded frames and timing.

**3. Replay.** Switch the client to `fm-replay-anthropic`. The `default`
scenario answers each request with the recording of the same conversation (or
the longest shared prefix), and falls back to sampling. For an exact re-run in
order, use a sequence scenario:

```yaml
name: rerun
selection: { mode: sequence, cassette: cas_..., onEnd: error }
```

**4. Break things.** Write scenarios for the conditions your client must
survive, and select them per key, per request header, or with the model suffix.

## Scenarios

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

| Section | What it controls |
|---|---|
| `selection` | `match` (exact, then longest prefix of at least `minPrefix` segments), `sequence` (cassette position = call number; `onEnd: error \| loop \| last \| sample`), `sample` (seeded, scored by model, tool compatibility, reasoning and input size; `strict` makes them filters; `models` maps requested models to recorded ones), or `match-then-sample` (the default). `outcomes` lists the outcomes match and sample may return (default `ok`). |
| `rewrite` | Consistent rewriting of response, message, item and tool call ids (same prefix, length and alphabet), the model name (`auto` rewrites only when the client asked for a different model than the recording) and timestamps. |
| `fidelity` | `raw` replays the recorded chunks byte for byte, skipping rewrites. |
| `timing` | `recorded` with `scale`, or `synthetic` with `ttftMs`, `tps` and `jitterMs`. A distribution is a number or `{ dist: fixed \| uniform \| normal \| lognormal, ... }`. |
| `network` | `latencyMs`, `headersDelayMs`, `jitterMs` (per frame), `bandwidthKBps`, `fragmentation` (`maxBytes`, `minBytes`, `gapMs`), `stalls` (per frame). |
| `faults` | Rules of `when` and `inject`; the first rule that fires is injected. `when`: `callIndex` (number, list or `{ from, to }`), `everyN`, `probability`, `window` (`startMs`, `endMs`, `periodMs`), `model`, `stream`, `hasTools`, `protocol`. `inject`: `http_error`, `stream_error_event`, `interrupt` (`at: { fraction \| frame \| afterMs }`, `mode: fin \| abort \| reset \| hang \| ws_close \| ws_terminate`), `concurrency_limit` (`max`). |
| `transforms` | Extra registered transforms, `{ type, ...config }`. |

Error bodies and stream error events come from recordings chosen by `from`
(an outcome glob, a model or a recording id). `status`, `headers`, `body` and
an inline `event` override them. With no matching recording and no override,
FlowMock answers with its own diagnostic error rather than inventing one.

`examples/scenarios` holds the four demo scenarios.
`GET /api/schema/scenario` serves the JSON Schema for editors.

## Configuration

| Flag | Environment | Default | Meaning |
|---|---|---|---|
| `--host` | `FLOWMOCK_HOST` | `127.0.0.1` | Interface to listen on |
| `--port` | `FLOWMOCK_PORT` | `8787` | Port |
| `--data` | `FLOWMOCK_DATA_DIR` | `./data` | Database and recorded chunks |
| `--config` | `FLOWMOCK_CONFIG` | none | `flowmock.yaml` applied at startup |
| | `FLOWMOCK_ADMIN_KEY` | none | Bearer token for `/api` and `/metrics` |
| | `FLOWMOCK_TIMELINE_PERSIST` | `0` | Store the request timeline in SQLite (`1` enables it) |
| | `FLOWMOCK_TIMELINE_RETAIN_DAYS` | `7` | Persistent timeline retention in days |
| | `FLOWMOCK_TIMELINE_MAX` | `100000` | Maximum persistent timeline entries |
| | `FLOWMOCK_WEB_DIST_DIR` | `../web/dist/client` | Management app build directory, relative to `apps/server` |
| | `FLOWMOCK_SHUTDOWN_GRACE_MS` | `10000` | Time to drain HTTP and WebSocket streams on shutdown |

Without `FLOWMOCK_ADMIN_KEY` the admin API is open, so FlowMock refuses to
listen on anything but a loopback address.

`flowmock.yaml` holds `targets`, `keys`, `scenarios` (inline), `scenarioDir`
(a directory of scenario files) and `corpus` (exported corpus files imported at
startup). Entries are upserted on every start; entries created through the API
are left alone. A scenario file is stored as written, comments included, unless
its values name environment variables. See
[`examples/flowmock.yaml`](examples/flowmock.yaml).

Runtime settings also support YAML; environment variables take precedence:

```yaml
timeline: { persist: true, retainDays: 7, maxEntries: 100000 }
webDistDir: ../web/dist/client
shutdownGraceMs: 10000
```

On SIGINT or SIGTERM, FlowMock stops accepting new work and waits for active
streams. Exchanges cut off at the deadline are saved as `truncated` before
SQLite closes. A second signal exits immediately. The management app's GET/HEAD
routes serve the static build with SPA fallback; `/assets/` files have immutable
caching, while API and data-plane paths always reach the server. A missing
build returns 503 on the app's routes.

## Inspecting replays

Every request lands in the request timeline with its selection, the fault that
fired, the provenance of each transform, per-frame origins, and planned against
achieved timing:

```bash
curl -s 'http://127.0.0.1:8787/api/requests?limit=5'
```

A scenario can be tried without sending anything: the preview returns the
recording that would be selected, the fault, every write with its time, and
the expected TTFT and TPS. Pass `source` to preview unsaved YAML in place of
the stored scenario.

```bash
curl -s http://127.0.0.1:8787/api/scenarios/weak-network-429/preview \
  -H 'content-type: application/json' \
  -d '{"protocol":"openai-chat-completions","callIndex":3,"body":{"model":"gpt-4o-mini","stream":true,"messages":[{"role":"user","content":"Hello!"}]}}'
```

Prometheus metrics are served at `/metrics`: requests by protocol, mode and
outcome, injected faults, recordings, and histograms of the achieved TTFT and
TPS.

## Admin API

All routes live under `/api`. When `FLOWMOCK_ADMIN_KEY` is set, authenticate
with `Authorization: Bearer <admin-key>` or `x-flowmock-admin-session: <token>`.
`GET /api/health` and `POST /api/auth/login` are public. Login exchanges
`{ "key": "<admin-key>" }` for `{ token, expiresAt }`; only a SHA-256 token hash
is stored. Sessions have a sliding seven-day lifetime and are revoked on
logout. Without a configured admin key, any nonempty login key is accepted
on loopback and `/api/auth/me` reports `open` for requests without credentials.

```bash
curl -s http://127.0.0.1:8787/api/auth/login \
  -H 'content-type: application/json' -d '{"key":"your-admin-key"}'
# Copy the returned token into the admin-session header.
curl -N http://127.0.0.1:8787/api/live \
  -H 'x-flowmock-admin-session: <token>'
```

A refused scenario answers 400 with `error.issues` (each a `path` into the
document and a `message`) for invalid fields, or `error.position` (`line`,
`col`) where the text stopped being YAML.

`GET /api/live` emits `snapshot` events every second with active requests,
a ten-second completion rate, and sixty-second protocol/error/fault counts
and TTFT/TPS quantiles. `GET /api/requests/stream` emits lightweight `request`
events when a trace is added. Both streams send keep-alive comments every
fifteen seconds and accept `?session=<token>` for browser EventSource clients.
Query credentials are accepted only on these two GET routes. The data-plane
header `x-flowmock-session` names a replay/recording session and is independent
of admin authentication.

| Route | Purpose |
|---|---|
| `POST /auth/login`, `GET /auth/me`, `DELETE /auth/session` | Login, inspect authentication and revoke the current admin session. |
| `GET /settings` | Version, whether an admin key protects the API, and how the timeline is kept. |
| `GET /recordings`, `GET /recordings/:id`, `GET /recordings/:id/body`, `DELETE /recordings/:id` | Browse the corpus, decoded frames included. Filters: `protocol`, `model`, `outcome`, `cassette`, `session`, `q` (case-insensitive body substring), `before` (recording id), `limit`, `offset`. |
| `POST /recordings/delete` | Delete `{ ids: [...] }` in one database transaction, remove chunk files and return `{ deleted }`. |
| `GET /stats` | Total recording count and body bytes, plus `byProtocol`, `byOutcome` and `byModel` groups, each with counts and bytes. |
| `GET /cassettes`, `GET/PATCH/DELETE /cassettes/:id` | Recording sessions; `closed: true` starts a new cassette on the next request; `DELETE ?recordings=true` deletes the recordings too. |
| `GET /scenarios`, `GET/PUT/DELETE /scenarios/:name` | Scenarios; `PUT` takes YAML or JSON. |
| `POST /scenarios/:name/preview`, `POST /scenarios/:name/reset` | Plan a request without sending it, against the stored scenario or an unsaved `source`; clear call counters and time-window epochs. |
| `GET/POST /keys`, `DELETE /keys/:key` | Key bindings. |
| `GET/POST /targets`, `DELETE /targets/:id` | Record targets (secrets masked). A header given as `null` keeps the value stored under its name. |
| `GET /requests`, `GET /requests/:id` | Request timeline with `before`, `limit`, `mode`, `key` (key name), `protocol`, `outcome` and `status` (`2xx`, `3xx`, `4xx`, `5xx`) filters. |
| `GET /live`, `GET /requests/stream` | Live metrics and completed request summaries over SSE. |
| `GET /export`, `POST /import` | Portable NDJSON corpus. |
| `GET /schema/scenario`, `GET /transforms` | Schemas for editors. |
| `GET /health` | Version and liveness. |

## Data and portability

- `data/flowmock.db` is a SQLite database (recordings, cassettes, scenarios,
  keys, targets); `data/chunks/` holds each recording's body chunks with their
  arrival times.
- `GET /api/export` writes the corpus (or one cassette with `?cassette=`) as
  newline-delimited JSON; `POST /api/import` and the `corpus` setting of
  `flowmock.yaml` read it back. Imports keep ids, so importing twice is a
  no-op. `examples/demo-corpus.generated.ndjson` is such a file.

## Limitations

- The request timeline defaults to the last 1000 requests in memory. Optional
  SQLite persistence keeps it across restarts, caps stored traces at 500 frame
  summaries and prunes expired entries at startup and every ten minutes.
- With no matching error recording and no explicit `status`, error faults are
  reported instead of synthesized.
- A streaming request cannot be served from a non-streaming recording.
- Responses `previous_response_id` continuations are resolved leniently: an
  unknown id does not fail the request.
- Rate limiting covers concurrency only; RPM and TPM limits are planned.
- Packet-level impairments (loss, retransmission) are out of scope; put
  toxiproxy or `tc` in front of FlowMock for those.

## Development

```bash
pnpm run verify   # lint, typecheck, every test, and the web build with its output checks
```

| Path | Responsibility |
|---|---|
| `packages/protocols` | Wire types, SSE and JSON-array decoders, stream parsers and collect reducers for the four protocols. |
| `packages/core` | The runtime-independent engine: corpus analysis, normalization and fingerprints, selection, transforms, replay plans and the runner. |
| `packages/test-fixtures` | Realistic recorded exchanges shared by every test suite. |
| `packages/ui` | The browser UI foundation: Fluent UI restyled as WinUI 3, generic controls, lazily loaded editors, charts, the typed i18n boundary and the build helpers the web app uses. |
| `apps/server` | The Node server: data plane, recording proxy, WebSocket Responses, SQLite storage, admin API. |
| `apps/web` | The management app: a React Router SPA on `packages/ui`, built into `apps/web/dist/client` and served by `apps/server`. |
| `examples` | Example configuration, scenarios and the demo corpus. |

Integration tests bind real sockets and drive FlowMock with the official
Anthropic, OpenAI and Google GenAI SDKs. Repository rules for contributors and
coding agents are in [AGENTS.md](AGENTS.md).

## Roadmap

The follow-up work is planned in [`docs/superpowers/plans`](docs/superpowers/plans):

1. Control plane completed: browser sessions, live metrics and request events
   over SSE, optional persistent timeline, static hosting, graceful shutdown,
   typed client contracts, and corpus search, pagination and bulk deletion.
2. Fidelity and transforms: synthesized protocol errors, streams synthesized
   from non-streaming recordings, token truncation, text and tool-name
   rewriting, templated responses, `previous_response_not_found`, RPM/TPM
   limits.
3. Management app completed: the WinUI-styled UI package and the web app on
   top of it.
4. Cross-protocol replay, multi-core load generation and a Docker image.

## License

MIT. Parts of FlowMock are ported from [Floway](https://github.com/Menci/Floway);
see [NOTICE.md](NOTICE.md).
