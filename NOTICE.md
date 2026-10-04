# Third-party notices

## Floway

FlowMock is an independent project. It does not depend on any Floway package,
but parts of its source are ported from [Floway](https://github.com/Menci/Floway)
under the MIT license, at revision
`c7e4d782763b010e44ba243588f2c83c90c97335`. Ported code evolves independently
in FlowMock and is not kept in sync with Floway.

Every ported file names its origin in a header comment. The ports are:

| FlowMock | Floway origin | Changes |
|---|---|---|
| `packages/protocols/src/common/sse.ts` | `packages/protocols/src/common/sse.ts` | Adds `encodeSseFrame`. |
| `packages/protocols/src/common/parse-sse.ts` | `packages/protocols/src/common/parse-sse.ts` | Same API, decoded by FlowMock's own `SseDecoder` (which keeps raw spans) instead of `eventsource-parser`. |
| `packages/protocols/src/common/parse-events.ts` | same path | Unchanged. |
| `packages/protocols/src/common/reassemble-extras.ts` | same path | Unchanged. |
| `packages/protocols/src/common/openai-stream.ts` | same path | Comment wording. |
| `packages/protocols/src/common/json.ts` | same path | Unchanged. |
| `packages/protocols/src/anthropic-messages/*` | `packages/protocols/src/anthropic-messages/*` | Wire types trimmed to what a recorder and replayer need; the SSE encoder serializes recorded events as they are. |
| `packages/protocols/src/openai-chat-completions/*` | `packages/protocols/src/openai-chat-completions/*` | The stream parser yields in-band error chunks instead of throwing. |
| `packages/protocols/src/openai-responses/*` | `packages/protocols/src/openai-responses/*` | Types trimmed with permissive item and tool shapes; the stream parser drops the gateway's fast-path expansion and sequence backfilling. |
| `packages/protocols/src/gemini-generate-content/*` | `packages/protocols/src/gemini-generate-content/*` | Adds the SSE and JSON-array stream parsers and the JSON-array encoder; finish reasons are open-string. |
| `packages/core/src/protocols/*` (output-frame detection) | `packages/gateway/src/data-plane/chat/shared/first-output-token.ts` | The classification is reused to measure TTFT and attribute output tokens. |
| `apps/server/src/store/database.ts` (`applyMigrations`) | `apps/platform-node/src/migrate.ts` | Synchronous `node:sqlite` version. |
| `apps/server/src/static-web.ts` | `apps/platform-node/src/static-web.ts` | FlowMock-owned paths, environment setting and build diagnostic; rejects raw dot-segment traversal and symlink escapes. |
| `eslint.config.ts` | `eslint.config.ts` | Trimmed to FlowMock's packages; adds the runtime-independence rules for `packages/*` and enforces the Fluent, toast and `react-i18next` import boundaries that Floway keeps by convention. |
| `packages/ui/__tests__/{setup,match-media-stub,local-storage-stub,settle}.ts` | `apps/web/__tests__/*` (same names) | Setup loads no app i18n and skips DOM preparation for Node-environment suites. |

Design references without copied code: the recording format of
`packages/gateway/src/dump/`, the runtime contracts of `packages/platform`, the
Hono control plane of `packages/gateway/src/control-plane/`, and the Responses
WebSocket handling of
`packages/gateway/src/data-plane/chat/openai-responses/websocket.ts`.

Floway's license:

```
MIT License

Copyright (c) 2025 Menci
Copyright (c) 2026 Kirikaze Chiyuki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
