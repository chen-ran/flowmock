# FlowMock reference

English | [简体中文](reference_CN.md)

The details behind the [README](../README.md): concepts, the scenario format, configuration, the admin API, storage and known limitations.

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
[`examples/flowmock.yaml`](../examples/flowmock.yaml).

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
