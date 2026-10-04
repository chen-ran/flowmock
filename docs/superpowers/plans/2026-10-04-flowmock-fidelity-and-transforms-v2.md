# FlowMock 协议保真度与变换 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现原计划中“已预留但暂不实现”的变换，并补上 MVP 留下的协议保真度差距：无样本时按协议合成错误、非流式录制服务流式请求、按 token 截断、内容与工具名改写、模板响应、Responses `previous_response_not_found`、RPM/TPM 限流、长停顿期间的 keep-alive。

**Architecture:** 所有协议知识进入 `packages/core/src/protocols/*` 的适配器（新增可选方法），变换本身注册到 `transforms/registry.ts`，场景 schema 只增加带默认值的字段。合成内容在帧上标记新的来源 `synthesized`，时间线可以区分录制、改写、重编码、注入与合成。限流状态属于运行时，放在 `apps/server/src/state/`，引擎只通过 `ReplayContext` 接收“是否超限”的判定结果。

**Tech Stack:** TypeScript、zod 4、Vitest；参考 Floway `packages/protocols/src/openai-responses/from-result.ts`、`packages/translate`。

## Global Constraints

- 遵循 [总览](2026-10-04-flowmock-index.md) 的全部全局约束。
- 合成永远是显式选择：任何场景在不修改的情况下行为不变。新字段全部有默认值，默认值等于 MVP 行为。
- 每个合成的线格式（错误体、事件、头）都在常量旁附官方文档或 SDK 源码固定提交的链接。
- `FrameOrigin` 增加 `'synthesized'`；时间线、预览与 `trace.frames` 原样透出。
- 每个任务先写失败测试，确认 RED 后再实现；任务完成后提交。

---

### Task 1: 无样本时按协议合成错误

**Files:**
- Create: `packages/core/src/protocols/error-templates.ts`
- Modify: `packages/core/src/protocols/adapter.ts`（`ProtocolAdapter` 增加 `httpErrorTemplate` 与 `streamErrorTemplate`）
- Modify: 四个适配器文件
- Modify: `packages/core/src/scenario/schema.ts`（`http_error`、`stream_error_event`、`concurrency_limit` 增加 `onMissingSample: 'error' | 'synthesize'`，默认 `'error'`）
- Modify: `packages/core/src/engine.ts`（`httpErrorDraft`、`streamErrorEvents`）
- Modify: `packages/core/src/plan/types.ts`（`FrameOrigin` 增加 `'synthesized'`）
- Test: `packages/core/__tests__/protocols/error-templates_test.ts`、`packages/core/__tests__/engine_test.ts`

**Interfaces:**

```ts
export interface HttpErrorTemplate {
  status: number;
  headers: Array<[string, string]>;
  body: string;
}

// ProtocolAdapter 新增（可选方法，旧适配器不实现时引擎按 'error' 处理）
httpErrorTemplate?(status: number, options: { retryAfterSeconds?: number; requestId: string }): HttpErrorTemplate;
streamErrorTemplate?(kind: 'overloaded' | 'server_error' | 'rate_limited', options: { requestId: string }): unknown;
```

各协议模板（实现时在常量旁附链接）：

| 协议 | HTTP 错误体 | 状态码到类型的映射 | 头 |
|---|---|---|---|
| Anthropic | `{"type":"error","error":{"type":T,"message":M},"request_id":"req_…"}` | 400 invalid_request_error, 401 authentication_error, 403 permission_error, 404 not_found_error, 413 request_too_large, 429 rate_limit_error, 500 api_error, 529 overloaded_error（https://docs.anthropic.com/en/api/errors） | `request-id`，429/529 加 `retry-after`、`x-should-retry: true` |
| OpenAI（Chat/Responses） | `{"error":{"message":M,"type":T,"param":null,"code":C}}` | 429 `type: requests`/`code: rate_limit_exceeded`，500 `server_error`，503 `server_error`（https://platform.openai.com/docs/guides/error-codes） | `x-request-id`，429 加 `retry-after` 与 `x-ratelimit-reset-requests` |
| Gemini | `{"error":{"code":N,"message":M,"status":S}}` | 400 INVALID_ARGUMENT, 403 PERMISSION_DENIED, 404 NOT_FOUND, 429 RESOURCE_EXHAUSTED, 500 INTERNAL, 503 UNAVAILABLE, 504 DEADLINE_EXCEEDED（https://ai.google.dev/gemini-api/docs/troubleshooting） | 无特殊头 |

流中错误模板：Anthropic `event: error` + `{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}`；Chat 错误块 `{"error":{"message":…,"type":"server_error","param":null,"code":null}}`；Responses 用当前回放的 `response.created` 信封构造 `response.failed`（`error.code: server_error`），没有信封时用 `{"type":"error","code":"server_error","message":…}`；Gemini 错误元素 `{"error":{"code":500,"message":…,"status":"INTERNAL"}}`。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/__tests__/engine_test.ts 追加
it('synthesizes a protocol-shaped 429 when asked and no sample exists', async () => {
  const outcome = await planReplay(prepareFixtureRequest(chatText), context({
    name: 'synth-429',
    faults: [{ inject: { type: 'http_error', status: 429, onMissingSample: 'synthesize', headers: { 'retry-after': '3' } } }],
  }), corpus);
  expect(outcome.plan.status).toBe(429);
  expect(outcome.plan.headers).toContainEqual(['retry-after', '3']);
  expect(JSON.parse(bodyOf(outcome))).toMatchObject({ error: { type: 'requests', code: 'rate_limit_exceeded' } });
  expect(outcome.trace.frames[0].origin).toBe('synthesized');
});

it('still reports a missing sample by default', async () => {
  const outcome = await planReplay(prepareFixtureRequest(chatText), context({ name: 'needs-sample', faults: [{ inject: { type: 'stream_error_event' } }] }), corpus);
  expect(outcome.trace.error?.code).toBe('no_error_sample');
});
```

另在 `error-templates_test.ts` 中逐协议断言模板体可被各自协议的 `summarizeBody` 解析出期望的 `error.type`，并且 `analyzeResponse` 对合成的流中错误给出 `stream_error:<type>`。

- [ ] **Step 2: 确认 RED**：`pnpm --filter @flowmock/core exec vitest run __tests__/engine_test.ts` 失败（schema 拒绝 `onMissingSample`）。
- [ ] **Step 3: 实现模板与引擎分支**；`requestId` 由 `rewriteId` 从模板前缀生成，保证种子可复现。
- [ ] **Step 4: 服务端集成测试**：`apps/server/__tests__/faults_test.ts` 新增 Gemini 429 合成用例，用 `@google/genai` SDK 断言抛出的错误 `status` 为 429。
- [ ] **Step 5: 验证并提交**：`pnpm run verify`；`git commit -am "feat(core): synthesize protocol-shaped errors on request"`

---

### Task 2: 非流式录制服务流式请求

**Files:**
- Create: `packages/core/src/protocols/from-result/anthropic-messages.ts`
- Create: `packages/core/src/protocols/from-result/openai-chat-completions.ts`
- Create: `packages/core/src/protocols/from-result/openai-responses.ts`（参考移植 Floway `packages/protocols/src/openai-responses/from-result.ts`，文件头注明来源并登记 `NOTICE.md`）
- Create: `packages/core/src/protocols/from-result/gemini-generate-content.ts`
- Modify: `packages/core/src/protocols/adapter.ts`（`resultToEvents?(body, options): unknown[]`）
- Modify: `packages/core/src/selection/select.ts`（`canServe` 接受 `synthesizeStream` 选项）
- Modify: `packages/core/src/scenario/schema.ts`（`selection.synthesizeStream: boolean`，默认 `false`）
- Modify: `packages/core/src/plan/draft.ts`（流式目标 + `json` 录制 → 合成帧）
- Test: `packages/core/__tests__/protocols/from-result_test.ts`、`packages/core/__tests__/engine_test.ts`

**Interfaces:**

```ts
export interface ResultToEventsOptions {
  // 文本、推理与工具参数按这个字符数切块，模拟增量输出。
  chunkChars: number;   // 默认 16
  // Chat Completions：是否追加 usage 块（来自请求的 stream_options.include_usage）。
  includeUsage: boolean;
}
resultToEvents?(body: unknown, options: ResultToEventsOptions): unknown[];
```

时间安排：合成的帧没有录制时间。`draftFromRecording` 把内容帧按字符累计位置线性插值到 `[response.headersAt, response.endedAt]`，前导帧放在 `headersAt`，结尾帧放在 `endedAt`；`synthetic` 时序照常覆盖。

- [ ] **Step 1: 写往返测试**：对每个非流式 fixture（`anthropicNonStream`、`chatNonStream`、`responsesNonStream`、`geminiNonStream`），`resultToEvents` 产生的事件经各协议 `collect` 归约后与原始 body 深度相等（忽略 Chat 的 `annotations` 等仅非流式存在、流式无法表达的字段，测试中逐协议列出忽略字段并附原因）。
- [ ] **Step 2: 写选取与引擎测试**：语料只有 `anthropicNonStream` 时，流式请求在默认场景下得到 `no_recording`；`selection.synthesizeStream: true` 时得到 200 的 SSE，帧来源为 `synthesized`，`trace.provenance` 包含 `synthesize-stream`。
- [ ] **Step 3: 确认 RED**。
- [ ] **Step 4: 实现四个 `from-result` 模块与 draft 分支**。Responses 版本复用 Floway 的事件顺序（created → in_progress → 每个 output item 的 added/part/delta/done → completed），`sequence_number` 从 0 连续编号。
- [ ] **Step 5: 服务端用 SDK 验证**：Anthropic SDK `messages.stream` 对只有非流式录制的会话能拿到完整 `finalMessage`。
- [ ] **Step 6: 验证并提交**：`git commit -am "feat(core): synthesize streams from non-streaming recordings"`

---

### Task 3: Responses `previous_response_not_found`

**Files:**
- Modify: `packages/core/src/scenario/schema.ts`（`responses: { strictPreviousResponse: boolean }`，默认 `false`）
- Modify: `apps/server/src/data-plane/http.ts`、`apps/server/src/data-plane/websocket.ts`
- Modify: `apps/server/src/state/conversations.ts`（`evict(id)`）
- Test: `apps/server/__tests__/websocket_test.ts`、`apps/server/__tests__/record_replay_test.ts`

行为（依据 https://github.com/openresponses/openresponses/blob/92c12d96d7b61d6d15e2214daa5e9c6000ab6e1c/src/specifications/2026-04-24.mdx#L127 ）：
- 严格模式下未知的 `previous_response_id`：HTTP 返回 400 `{"error":{"message":"Previous response with id '<id>' not found.","type":"invalid_request_error","param":"previous_response_id","code":"previous_response_not_found"}}`；WS 发送 `{"type":"error","status":400,"error":{…同上…}}` 且连接保持打开。
- 续写回合以 4xx/5xx 结束（包括注入的故障）时，从记忆中驱逐被引用的 `previous_response_id`。

- [ ] **Step 1: 写失败测试**（WS：注入一次 `http_error` 后用同一 `previous_response_id` 续写得到 `previous_response_not_found`；HTTP：未知 id 直接 400）。
- [ ] **Step 2: 确认 RED。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 验证并提交**：`git commit -am "feat(server): emulate previous_response_not_found for strict scenarios"`

---

### Task 4: RPM/TPM 限流故障

**Files:**
- Create: `apps/server/src/state/rate-limits.ts`
- Modify: `packages/core/src/scenario/schema.ts`（新故障类型 `rate_limit`）
- Modify: `packages/core/src/engine.ts`（`ReplayContext.rateLimit?: { exceeded: boolean; retryAfterSeconds: number; limit: string }`，`rate_limit` 故障只在 `exceeded` 时触发）
- Modify: `apps/server/src/data-plane/http.ts`、`websocket.ts`（准入时查询令牌桶，完成后按实际输出 token 记账）
- Test: `apps/server/__tests__/state/rate-limits_test.ts`、`apps/server/__tests__/faults_test.ts`

```ts
// 场景 schema
z.object({
  type: z.literal('rate_limit'),
  rpm: z.number().int().positive().optional(),
  tpm: z.number().int().positive().optional(),
  scope: z.enum(['key', 'session']).default('key'),
  ...httpErrorOverrides,           // 默认 from: { outcome: 'http_error:429' }
}).refine(value => value.rpm !== undefined || value.tpm !== undefined, { message: 'rate_limit needs rpm or tpm' })
```

令牌桶按秒连续补充；TPM 在准入时扣除估算输入 token（`inputChars / 4`），回放完成后补扣实际输出 token。`retry-after` 由补满所需秒数向上取整得出，覆盖样本头中的同名值，`x-ratelimit-remaining-*` 头按协议写入（Anthropic 用 `anthropic-ratelimit-requests-remaining`，OpenAI 用 `x-ratelimit-remaining-requests`）。

- [ ] **Step 1: 令牌桶单测**（假时间：`rpm: 60` 时第 61 次在同一秒内超限，1 秒后恢复 1 次）。
- [ ] **Step 2: 集成测试**：`rpm: 2` 时连续 3 次请求，第三次 429 且 `retry-after` 为正整数；Anthropic SDK 在 `maxRetries: 1` 时按 `retry-after` 等待后成功。
- [ ] **Step 3: 确认 RED，实现，验证并提交**：`git commit -am "feat: add RPM and TPM rate-limit faults"`

---

### Task 5: 按 token 截断

**Files:**
- Create: `packages/core/src/transforms/truncate.ts`
- Modify: `packages/core/src/protocols/adapter.ts`（`truncateFrames?(frames, keepTokens, context): TruncationResult`）
- Modify: 四个适配器
- Test: `packages/core/__tests__/transforms/truncate_test.ts`

注册为 `content` 阶段变换 `truncate`：

```ts
z.object({
  maxTokens: z.number().int().positive(),
  // 'request' 读取请求的 max_tokens / max_output_tokens / maxOutputTokens，取二者较小值
  respect: z.enum(['config', 'request', 'min']).default('min'),
}).strict()
```

语义：在第 N 个输出 token 处切断——跨越边界的增量帧按字符比例切分文本（UTF-16 安全，不切断代理对），之后的内容帧丢弃，块/项的收尾帧保留并改写：Anthropic `stop_reason: max_tokens`、`usage.output_tokens: N`；Chat `finish_reason: length`；Responses `status: incomplete`、`incomplete_details.reason: max_output_tokens`；Gemini `finishReason: MAX_TOKENS`。工具参数被截断时保留不完整 JSON（与真实上游一致）。

- [ ] **Step 1: 写失败测试**：对 `anthropicText` 截断到 5 token，收集结果文本是原文前缀、`stop_reason` 为 `max_tokens`；对 `responsesText` 截断后 `collect` 得到 `status: incomplete`；对每个协议断言 `analyzeResponse` 仍判为 `ok`（截断是正常结束）。
- [ ] **Step 2: 确认 RED，实现，验证并提交**：`git commit -am "feat(core): truncate replays at a token budget"`

---

### Task 6: 内容改写与工具名映射

**Files:**
- Create: `packages/core/src/transforms/content.ts`
- Test: `packages/core/__tests__/transforms/content_test.ts`

注册两个 `content` 阶段变换：
- `replace-text`：`{ rules: [{ pattern: string, flags?: string, with: string }] }`，只作用于文本与推理增量；跨帧的匹配不处理（文档写明），替换后按新长度重新分摊 token。
- `rename-tools`：`{ map: Record<string, string> }`，改写工具调用名（Anthropic `content_block_start.content_block.name`、Chat `tool_calls[].function.name`、Responses `item.name`、Gemini `functionCall.name`）。采样模式下把录制里的工具名映射到客户端声明的工具名。

- [ ] **Step 1: 写失败测试**（`rename-tools` 后 `summarizeStream().toolNames` 变为新名字，`select.ts` 的工具兼容性评分在场景声明映射后认为兼容——为此 `sampleRecording` 接收映射并在评分前应用）。
- [ ] **Step 2: 确认 RED，实现，验证并提交**：`git commit -am "feat(core): rewrite text and tool names in replays"`

---

### Task 7: 模板响应

**Files:**
- Modify: `packages/core/src/scenario/schema.ts`（`selection.mode` 增加 `'template'`，`selection.template`）
- Create: `packages/core/src/plan/template.ts`
- Test: `packages/core/__tests__/plan/template_test.ts`

```yaml
selection:
  mode: template
  template:
    text: "Mocked answer for {{model}}."
    toolCalls: [{ name: get_weather, arguments: { location: Paris } }]
    usage: { inputTokens: 12, outputTokens: 20 }
    stopReason: auto      # 有工具调用时为 tool_use / tool_calls / completed / STOP
```

模板先生成各协议的非流式结果体，再用 Task 2 的 `resultToEvents` 得到流；没有录制可借用时序，`timing.mode: recorded` 视为 `synthetic`，参数取 `ttftMs: 500, tps: 50` 并记录到 provenance。`{{model}}` 是唯一的插值变量。

- [ ] **Step 1: 写失败测试**（四个协议的模板流都能被官方 SDK 消费——放在 `apps/server/__tests__/template_test.ts`；core 层断言帧来源全为 `synthesized`）。
- [ ] **Step 2: 确认 RED，实现，验证并提交**：`git commit -am "feat(core): answer from templates when no recording should be used"`

---

### Task 8: 长停顿期间的 keep-alive

**Files:**
- Modify: `packages/core/src/scenario/schema.ts`（`network.keepAlive: { everyMs: number; kind: 'comment' | 'protocol' }`，可选）
- Modify: `packages/core/src/transforms/network.ts`
- Test: `packages/core/__tests__/transforms/network_test.ts`

语义：在相邻两次写入间隔超过 `everyMs` 时插入保活写入。`comment` 插入 `: keep-alive\n\n`（只对 SSE）；`protocol` 插入协议原生保活：Anthropic `event: ping`（https://docs.anthropic.com/en/docs/build-with-claude/streaming#ping-events ），其他协议没有原生保活时退化为注释，WS 不插入。录制中本来就有的 ping 不受影响。保活写入标记 `content: false`，不影响 TTFT/TPS 测量。

- [ ] **Step 1: 写失败测试**（`stalls` 制造 5 秒停顿 + `keepAlive.everyMs: 1000` → 停顿期间出现 4 个保活写入；JSON 数组与 WS 不插入）。
- [ ] **Step 2: 确认 RED，实现，验证并提交**：`git commit -am "feat(core): keep long silences alive on request"`

---

### Task 9: 响应头中的请求 id 改写

**Files:**
- Modify: `packages/core/src/transforms/rewrite.ts`（`rewrite.headers: boolean`，默认 `true`）
- Test: `packages/core/__tests__/transforms/rewrite_test.ts`

改写 `request-id`、`x-request-id`、`x-goog-request-id` 的值（同前缀同长度），保证同一请求的错误体 `request_id` 与头一致（Anthropic 429 样本两处相同）。

- [ ] **Step 1: 写失败测试，确认 RED，实现，验证并提交**：`git commit -am "feat(core): rewrite request ids in replayed headers"`

---

## 阶段验收

- [ ] `pnpm run verify` 通过。
- [ ] `examples/scenarios` 新增 `synthesized-errors.yaml`、`template.yaml`、`rate-limited.yaml`，并在 README 的场景表中补充新字段。
- [ ] 默认场景与 MVP 行为一致：`apps/server/__tests__` 中 MVP 的全部用例不改动即通过。
