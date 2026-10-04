# FlowMock 阶段 9：跨协议回放、多核压测与容器化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让协议 A 的录制可以按协议 B 返回；让单机压测能跑满多核并给出可信的时序误差数据；提供可直接运行的打包产物与 Docker 镜像。

**Architecture:** 跨协议回放在 `packages/core` 引入与协议无关的规范事件序列（canonical events），每个适配器实现“帧 → 规范事件”与“规范事件 → 帧”，时间戳随事件携带，变换层仍作用在目标协议的帧上。性能工作分两层：引擎内的解码缓存（同一录制只解码、分析、归约一次），以及服务端的 `node:cluster` 多进程；多进程下会话计数、并发、限流、对话记忆与时间线需要一致，因此抽象出 `StateBackend`，单进程用本地实现，多进程由主进程经 IPC 集中维护。打包使用 esbuild 生成单文件服务端，Docker 镜像基于 `node:24-slim`。

**Tech Stack:** TypeScript、`node:cluster`、esbuild、undici（压测客户端）、Docker。

## Global Constraints

- 遵循 [总览](2026-10-04-flowmock-index.md) 的全部全局约束。
- 跨协议回放是显式选择（场景开关），产物帧的来源标记为 `reencoded`（结构转换）或 `synthesized`（目标协议需要而源协议没有的帧），provenance 写明源协议。
- 多进程模式下，单进程模式的全部测试语义（调用序号、并发上限、`previous_response_id` 续写、时间线）必须保持；新增的多进程集成测试至少覆盖这四项。
- 压测数据在报告中写明机器、Node 版本、并发数与场景，不得只给单个数字。
- 依赖 [协议保真度与变换 v2](2026-10-04-flowmock-fidelity-and-transforms-v2.md) 的 Task 1（错误模板）与 Task 2（`resultToEvents`）。

---

### Task 1: 规范事件 IR 与四协议双向转换

**Files:**
- Create: `packages/core/src/canonical/types.ts`
- Create: `packages/core/src/canonical/{anthropic-messages.ts,openai-chat-completions.ts,openai-responses.ts,gemini-generate-content.ts}`
- Modify: `packages/core/src/protocols/adapter.ts`（`toCanonical?`、`fromCanonical?`）
- Test: `packages/core/__tests__/canonical/round-trip_test.ts`、`packages/core/__tests__/canonical/cross_test.ts`

**Interfaces:**

```ts
export type CanonicalEvent =
  | { kind: 'start'; model: string | null }
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string; signature?: string }
  | { kind: 'tool-start'; callIndex: number; id: string; name: string }
  | { kind: 'tool-args'; callIndex: number; delta: string }
  | { kind: 'tool-end'; callIndex: number }
  | { kind: 'stop'; reason: 'end' | 'max_tokens' | 'tool_use' | 'refusal' | 'error' }
  | { kind: 'usage'; inputTokens: number | null; outputTokens: number | null; reasoningTokens?: number | null }
  | { kind: 'error'; type: string; message: string };

export interface TimedCanonicalEvent { at: number; event: CanonicalEvent }
```

转换规则参考 Floway `packages/translate`（只读参考，不移植其网关依赖）：停止原因映射（Anthropic `end_turn/max_tokens/tool_use/refusal` ↔ Chat `stop/length/tool_calls/content_filter` ↔ Responses `completed/incomplete(max_output_tokens)/failed` ↔ Gemini `STOP/MAX_TOKENS/SAFETY`），工具调用 id 前缀按目标协议生成（`toolu_`、`call_`、`fc_`+`call_`、Gemini 无 id），推理内容在目标协议不支持可见推理时丢弃并记入 provenance。

- [ ] **Step 1: 写往返测试**：对每个流式 fixture，`fromCanonical(toCanonical(frames))` 在同协议下经 `collect` 归约的结果与原录制归约结果等价（id 除外）。
- [ ] **Step 2: 写交叉测试**：`anthropicToolUseThinking` 转为 Chat、Responses、Gemini 后，各自 `summarizeStream` 的 `toolNames`、`stopReason` 映射正确，文本拼接一致；`anthropicOverloadedMidStream` 转为 Chat 时末尾是 Chat 错误块。
- [ ] **Step 3: 确认 RED，实现，验证并提交**：`git commit -am "feat(core): convert replays through canonical events"`

---

### Task 2: 跨协议选取与回放

**Files:**
- Modify: `packages/core/src/scenario/schema.ts`（`selection.crossProtocol: { enabled: boolean; from: Protocol[] }`，默认关闭）
- Modify: `packages/core/src/selection/select.ts`（同协议没有候选时，从 `from` 列出的协议取候选，评分扣 5 分）
- Modify: `packages/core/src/plan/draft.ts`（源协议 ≠ 目标协议时走 canonical 转换，保留每个事件的录制时间）
- Modify: `packages/core/src/engine.ts`（`CorpusStore.listCandidates` 对多个协议调用）
- Test: `packages/core/__tests__/engine_test.ts`、`apps/server/__tests__/cross_protocol_test.ts`

- [ ] **Step 1: 写测试**：只有 Anthropic 录制时，OpenAI SDK 的 Chat 流式请求在开启 `crossProtocol` 后得到完整回复，`trace.provenance` 含 `cross-protocol: anthropic-messages → openai-chat-completions`；HTTP 429 样本跨协议时用目标协议的错误模板重写错误体，状态与 `retry-after` 保留。
- [ ] **Step 2: 确认 RED，实现，验证并提交**：`git commit -am "feat: replay recordings across protocols on request"`

---

### Task 3: 解码缓存与压测工具

**Files:**
- Create: `packages/core/src/corpus/decoded-cache.ts`（按录制 id 缓存 `analyzeResponse` 结果与 `collect` 后的 body，容量可配置，LRU）
- Modify: `packages/core/src/plan/draft.ts`、`packages/core/src/engine.ts`（`ReplayContext.cache?: DecodedCache`）
- Create: `apps/server/src/bench/{bench.ts,report.ts}`、`apps/server/src/main.ts`（`flowmock bench` 子命令）
- Test: `packages/core/__tests__/corpus/decoded-cache_test.ts`、`apps/server/__tests__/bench_test.ts`

**Interfaces:**
- `flowmock bench --url http://127.0.0.1:8787 --key <mock-key> --protocol anthropic-messages --concurrency 500 --duration 30s --body request.json`：用 undici `Pool` 发起流式请求，客户端侧测量首个内容事件到达时间与输出速率，与响应头 `x-flowmock-request-id` 对应的服务端 `result` 对比，输出吞吐、TTFT 误差分位数（客户端实测 − 计划值）、错误分布；`--json` 输出机器可读报告。

- [ ] **Step 1: 缓存单测**：同一录制第二次 `planReplay` 不再调用 `decodeWireFrames`（用 `vi.spyOn` 计数）；录制删除后缓存失效（`SqliteCorpus` 在删除时通知缓存）。
- [ ] **Step 2: bench 冒烟测试**：对测试服务器跑 2 秒、并发 20，报告字段齐全且无错误。
- [ ] **Step 3: 确认 RED，实现。**
- [ ] **Step 4: 记录基线**：在开发机上对 `examples/flowmock.yaml` 的 `fm-demo-replay` 以并发 100/500/1000/2000 各跑 30 秒，把报告写入 `docs/benchmarks/2026-xx-xx-single-process.md`（机器、Node 版本、场景、结果）。
- [ ] **Step 5: 验证并提交**：`git commit -am "perf: cache decoded recordings and add a load-test harness"`

---

### Task 4: 多进程（`node:cluster`）与共享状态

**Files:**
- Create: `apps/server/src/state/backend.ts`（`StateBackend` 接口与本地实现，把 `SessionState`、`ConversationMemory`、`Timeline`、限流器、cassette 分配收拢到一个接口后面）
- Create: `apps/server/src/cluster/{primary.ts,worker.ts,ipc-backend.ts}`
- Modify: `apps/server/src/main.ts`（`--workers <n|auto>`，默认 1）、`apps/server/src/services.ts`、各数据面处理器改用异步 `StateBackend`
- Test: `apps/server/__tests__/cluster_test.ts`

**Interfaces:**

```ts
export interface StateBackend {
  nextCall(key: string, scenario: string, session: string): Promise<number>;
  enter(key: string): Promise<number>;
  leave(key: string): Promise<void>;
  scenarioElapsed(scenario: string, now: number): Promise<number>;
  conversation(responseId: string): Promise<unknown[] | null>;
  remember(responseId: string, items: unknown[]): Promise<void>;
  claimCassette(input: { keyName: string; key: string; targetId: string; sessionId: string }): Promise<{ cassetteId: string; seq: number }>;
  recordTimeline(entry: TimelineEntry): Promise<void>;
  corpusChanged(): Promise<void>;           // 广播，worker 清空候选缓存
}
```

主进程持有唯一的状态与 SQLite 写连接；worker 通过 IPC 请求-响应（带关联 id）访问状态，SQLite 以只读方式打开用于选取与加载录制，录制写入通过 IPC 交给主进程。管理 API 只在主进程监听的端口上提供（或由 worker 转发到主进程，实施时二选一并写明理由）。

- [ ] **Step 1: 写多进程集成测试**（`--workers 4`）：同一 session 跨多个连接的第 3 次调用触发 `callIndex: 3` 故障恰好一次；`concurrency_limit: max 2` 在 4 个 worker 间全局生效；WS 第一回合与续写回合落在不同 worker 时 `previous_response_id` 仍精确匹配；时间线条目总数等于请求数；录制模式下 cassette 序号连续。
- [ ] **Step 2: 确认 RED，实现（先把现有单进程状态迁到 `StateBackend` 本地实现并保证全量测试通过，再实现 IPC 版本）。**
- [ ] **Step 3: 多进程基线**：用 Task 3 的 bench 在 `--workers auto` 下重跑，报告写入 `docs/benchmarks/`。
- [ ] **Step 4: 验证并提交**：`git commit -am "feat(server): run on every core with shared replay state"`

---

### Task 5: 打包产物与 Docker 镜像

**Files:**
- Create: `apps/server/build.ts`（esbuild：入口 `src/main.ts`，`platform: node`、`format: esm`、`target: node22`，`node:*` 外部化，产物 `dist/flowmock.mjs`，迁移 SQL 复制到 `dist/migrations/`）
- Modify: `apps/server/src/store/database.ts`（迁移目录解析同时支持源码与打包布局）
- Create: `Dockerfile`、`.dockerignore`、`docker/compose.yaml`、`docker/flowmock.yaml`
- Modify: `.github/workflows/verify.yaml`（追加构建镜像的 job，不推送）
- Test: `apps/server/__tests__/build_test.ts`（构建后用 `node dist/flowmock.mjs --port 0` 启动并请求 `/api/health`）

Dockerfile 要点：多阶段（`node:24-slim`），`corepack enable`，`pnpm fetch` + `pnpm install --offline --frozen-lockfile`，构建 `apps/web` 与服务端单文件，运行阶段只复制 `dist/`、web 静态产物与生产依赖；非 root 用户；`VOLUME /data`；`EXPOSE 8787`；`ENV FLOWMOCK_HOST=0.0.0.0`（因此镜像启动时必须提供 `FLOWMOCK_ADMIN_KEY`，否则按现有约束拒绝启动——在 README 中说明）；`HEALTHCHECK` 请求 `/api/health`（阶段 6 已改为免认证）。

- [ ] **Step 1: 写构建测试，确认 RED，实现 `build.ts`。**
- [ ] **Step 2: 写 Dockerfile 并本地构建：`docker build -t flowmock:dev .`；`docker run -e FLOWMOCK_ADMIN_KEY=x -p 8787:8787 -v $PWD/examples:/config flowmock:dev --config /config/flowmock.yaml` 后 curl 回放成功。**
- [ ] **Step 3: compose 示例与 README 更新，验证并提交**：`git commit -am "build: ship a bundled server and a Docker image"`

---

## 阶段验收

- [ ] `pnpm run verify` 通过；CI 中镜像构建 job 通过。
- [ ] `docs/benchmarks/` 中有单进程与多进程两份基线报告。
- [ ] 跨协议回放在四个协议两两之间（12 个方向）都有至少一个 SDK 级集成用例。
