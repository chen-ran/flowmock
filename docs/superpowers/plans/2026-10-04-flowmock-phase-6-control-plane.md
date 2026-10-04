# FlowMock 阶段 6：控制面补完 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 补齐管理平台需要的控制面能力：管理密钥换取浏览器 session、实时指标与请求事件 SSE、请求时间线可选落库、托管前端静态产物、优雅停机，以及类型化客户端契约测试。

**Architecture:** 全部改动在 `apps/server`。认证从 `control/routes.ts` 的单一 Bearer 中间件拆为 `control/auth.ts`，同时接受 Bearer 管理密钥与 `x-flowmock-admin-session` session 头（SSE GET 额外接受 `?session=`）。实时数据由新的 `state/live.ts` 滚动窗口聚合器提供，它订阅 `Timeline` 的新增事件。时间线持久化是 `Timeline` 的可选后端（SQLite 表 `request_traces`）。静态托管在 `app.ts` 之外包一层 fetch handler，数据面与 `/api` 路径永远交给 Hono。

**Tech Stack:** Hono 4、`@hono/node-server`、`node:sqlite`、zod 4、Vitest 4。

## Global Constraints

- 遵循 [总览](2026-10-04-flowmock-index.md) 的全部全局约束。
- 数据面覆盖头 `x-flowmock-session` 的含义不变；管理 session 使用不同的头名 `x-flowmock-admin-session`，两者不得混用。
- 未设置 `FLOWMOCK_ADMIN_KEY` 时服务只能监听回环地址（已有约束），此时登录接口接受任意密钥并签发 session，便于本地开发。
- 新增配置同时支持环境变量与 `flowmock.yaml`；环境变量优先。
- 每个任务先写失败测试，确认 RED 后再实现。

---

### Task 1: 管理 session 登录

**Files:**
- Create: `apps/server/src/store/migrations/0002_admin_sessions.sql`
- Create: `apps/server/src/store/admin-sessions.ts`
- Create: `apps/server/src/control/auth.ts`
- Modify: `apps/server/src/control/routes.ts`（移除 `adminAuth`，改用 `control/auth.ts` 的中间件并挂载 `/auth/*`）
- Modify: `apps/server/src/app.ts`（`/metrics` 改用新中间件）
- Modify: `apps/server/src/services.ts`（加入 `adminSessions`）
- Test: `apps/server/__tests__/control/auth_test.ts`

**Interfaces:**
- Produces: `POST /api/auth/login {key}` → `201 {token, expiresAt}`；`GET /api/auth/me` → `{via: 'session' | 'admin-key' | 'open'}`；`DELETE /api/auth/session` → `204`。
- Produces: `adminAuth(services)` 中间件，顺序检查 Bearer 管理密钥、`x-flowmock-admin-session`、（仅 GET `/api/live` 与 `/api/requests/stream`）`?session=`。

- [x] **Step 1: 写失败测试**

```ts
// apps/server/__tests__/control/auth_test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_KEY, startTestServer, type TestServer } from '../support/flowmock.ts';

let flowmock: TestServer;
beforeAll(async () => { flowmock = await startTestServer(); });
afterAll(async () => { await flowmock.stop(); });

const login = (key: string) => fetch(`${flowmock.url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });

describe('admin sessions', () => {
  it('exchanges the admin key for a session token', async () => {
    const response = await login(ADMIN_KEY);
    expect(response.status).toBe(201);
    const { token } = await response.json() as { token: string };
    const me = await fetch(`${flowmock.url}/api/auth/me`, { headers: { 'x-flowmock-admin-session': token } });
    expect(await me.json()).toEqual({ via: 'session' });
    const scenarios = await fetch(`${flowmock.url}/api/scenarios`, { headers: { 'x-flowmock-admin-session': token } });
    expect(scenarios.status).toBe(200);
  });

  it('rejects a wrong key and throttles repeated failures', async () => {
    for (let attempt = 0; attempt < 10; attempt++) expect((await login('wrong')).status).toBe(401);
    expect((await login('wrong')).status).toBe(429);
  });

  it('revokes a session on logout', async () => {
    const { token } = await (await login(ADMIN_KEY)).json() as { token: string };
    expect((await fetch(`${flowmock.url}/api/auth/session`, { method: 'DELETE', headers: { 'x-flowmock-admin-session': token } })).status).toBe(204);
    expect((await fetch(`${flowmock.url}/api/scenarios`, { headers: { 'x-flowmock-admin-session': token } })).status).toBe(401);
  });

  it('never accepts the data-plane session header as an admin session', async () => {
    const { token } = await (await login(ADMIN_KEY)).json() as { token: string };
    expect((await fetch(`${flowmock.url}/api/scenarios`, { headers: { 'x-flowmock-session': token } })).status).toBe(401);
  });
});
```

注意：登录失败计数需要按客户端地址分桶，测试里所有请求来自 127.0.0.1，第 11 次返回 429；`ADMIN_KEY` 已在 `__tests__/support/flowmock.ts` 导出。

- [x] **Step 2: 运行测试确认 RED**

Run: `pnpm --filter @flowmock/server exec vitest run __tests__/control/auth_test.ts`
Expected: FAIL，`/api/auth/login` 返回 401（现有中间件要求 Bearer）。

- [x] **Step 3: 实现迁移与存储**

```sql
-- apps/server/src/store/migrations/0002_admin_sessions.sql
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
```

`admin-sessions.ts` 只保存 token 的 SHA-256（`node:crypto` 的 `createHash`），token 本身用 `randomBytes(32).toString('base64url')` 生成。滑动过期 7 天：`touch()` 在剩余有效期不足一半时把 `expires_at` 推到 `now + 7d`。提供 `create()`、`verify(token)`、`revoke(token)`、`purgeExpired(now)`。

- [x] **Step 4: 实现中间件与路由**

`control/auth.ts` 要点：
- 登录失败计数：`Map<address, {failures, windowStart}>`，60 秒窗口内第 11 次起返回 `429`，成功登录清零。地址取 `c.env.incoming.socket.remoteAddress`。
- `adminKey === null` 时任何非空 key 都能登录，`/auth/me` 对无凭据请求返回 `{via: 'open'}`。
- 比较管理密钥继续使用 `timingSafeEqual`。
- 路由 `/auth/login` 与 `/health` 免认证；其余 `/api/*` 走中间件。

- [x] **Step 5: 验证 GREEN 并跑全量**

Run: `pnpm --filter @flowmock/server exec vitest run __tests__/control/auth_test.ts && pnpm run verify`
Expected: 全部 PASS；已有 `control_test.ts` 的 Bearer 用例保持通过。

- [x] **Step 6: 提交**

```bash
git add apps/server
git commit -m "feat(server): exchange the admin key for browser sessions"
```

---

### Task 2: 实时指标与请求事件 SSE

**Files:**
- Create: `apps/server/src/state/live.ts`
- Modify: `apps/server/src/state/timeline.ts`（`subscribe` 已存在，保持不变；新增 `summary(entry)` 生成轻量事件）
- Modify: `apps/server/src/control/routes.ts`（`GET /api/live`、`GET /api/requests/stream`）
- Modify: `apps/server/src/services.ts`（创建 `LiveAggregator` 并订阅时间线）
- Test: `apps/server/__tests__/state/live_test.ts`、`apps/server/__tests__/control/live_stream_test.ts`

**Interfaces:**
- Produces: `LiveAggregator.snapshot(now): LiveSnapshot`

```ts
export interface LiveSnapshot {
  at: number;                       // epoch ms
  activeRequests: number;
  requestsPerSecond: number;        // 最近 10 秒均值
  byProtocol: Record<string, { requests: number; errors: number }>; // 最近 60 秒
  faults: Record<string, number>;   // 最近 60 秒按类型计数
  ttftMs: { p50: number | null; p90: number | null; p99: number | null };
  tps: { p50: number | null; p90: number | null; p99: number | null };
}
```

- Produces: `GET /api/live` SSE：每秒一个 `event: snapshot`，每 15 秒一个 `: keep-alive` 注释；`GET /api/requests/stream` SSE：每条新时间线记录一个 `event: request`（只含 id、startedAt、mode、keyName、protocol、transport、status、outcome、recordingId、achievedTtftMs、achievedTps、fault 类型）。

- [x] **Step 1: 写聚合器单测（假时间）**

```ts
// apps/server/__tests__/state/live_test.ts
import { describe, expect, it } from 'vitest';

import { LiveAggregator } from '../../src/state/live.ts';

describe('LiveAggregator', () => {
  it('computes rolling quantiles and drops samples older than the window', () => {
    const live = new LiveAggregator(() => 2);
    for (let index = 1; index <= 100; index++) live.observe({ at: 1_000 + index, protocol: 'anthropic-messages', ok: true, fault: null, ttftMs: index * 10, tps: index });
    const snapshot = live.snapshot(1_200);
    expect(snapshot.activeRequests).toBe(2);
    expect(snapshot.ttftMs.p50).toBe(500);
    expect(snapshot.tps.p99).toBe(99);
    expect(live.snapshot(70_000).ttftMs.p50).toBeNull();
  });

  it('counts faults by type within the last minute', () => {
    const live = new LiveAggregator(() => 0);
    live.observe({ at: 0, protocol: 'openai-chat-completions', ok: false, fault: 'http_error', ttftMs: null, tps: null });
    expect(live.snapshot(30_000).faults).toEqual({ http_error: 1 });
    expect(live.snapshot(61_000).faults).toEqual({});
  });
});
```

分位数使用最近邻排名法（nearest-rank），窗口 60 秒，样本保存在按时间有序的数组中并在 `snapshot` 时裁剪。

- [x] **Step 2: 运行确认 RED**

Run: `pnpm --filter @flowmock/server exec vitest run __tests__/state/live_test.ts`
Expected: FAIL，模块不存在。

- [x] **Step 3: 实现 `state/live.ts` 并接入时间线**

`services.ts` 中 `timeline.subscribe(entry => live.observe(fromEntry(entry)))`；`fromEntry` 取 `entry.result?.achievedTtftMs`、`achievedTps`、`entry.trace?.fault?.type`，`ok` 为 `status < 400 && outcome` 属于 `completed | ok | proxied`。

- [x] **Step 4: 写 SSE 集成测试**

用 `fetch` 打开 `/api/live`（Bearer 头），读取到第一个 `event: snapshot` 后发起一次回放请求，再读到 `activeRequests` 或 `requestsPerSecond` 变化；`/api/requests/stream` 在回放后 2 秒内收到对应 `event: request`，其 `id` 等于响应头 `x-flowmock-request-id`。客户端断开后服务端必须清理订阅（断言 `timeline` 的监听者数量回到连接前的基线（聚合器常驻一个监听者），为此给 `Timeline` 增加只读 `listenerCount`）。

- [x] **Step 5: 实现两个 SSE 路由**

使用 Hono `streamSSE`（`hono/streaming`）。`/api/live` 用 `setInterval` 每秒推送；在 `stream.onAbort` 中清除定时器与订阅。`?session=` 只对这两个路径生效。

- [x] **Step 6: 验证并提交**

Run: `pnpm run verify`
Expected: PASS。

```bash
git commit -am "feat(server): stream live metrics and request events over SSE"
```

---

### Task 3: 时间线可选落库

**Files:**
- Create: `apps/server/src/store/migrations/0003_request_traces.sql`
- Create: `apps/server/src/store/trace-store.ts`
- Modify: `apps/server/src/state/timeline.ts`（可选持久化后端、游标分页）
- Modify: `apps/server/src/server.ts`、`apps/server/src/main.ts`、`apps/server/src/config-file.ts`（配置项）
- Modify: `apps/server/src/control/routes.ts`（`GET /api/requests?before=<id>&limit=&mode=&key=&protocol=&outcome=`）
- Test: `apps/server/__tests__/store/trace-store_test.ts`、`apps/server/__tests__/control/timeline_test.ts`

**Interfaces:**
- 配置：`FLOWMOCK_TIMELINE_PERSIST=1`、`FLOWMOCK_TIMELINE_RETAIN_DAYS`（默认 7）、`FLOWMOCK_TIMELINE_MAX`（默认 100000）；`flowmock.yaml` 中 `timeline: { persist, retainDays, maxEntries }`。

```sql
CREATE TABLE request_traces (
  id TEXT PRIMARY KEY,           -- req_ 前缀，时间有序
  started_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  key_name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  status INTEGER,
  outcome TEXT,
  recording_id TEXT,
  entry TEXT NOT NULL            -- TimelineEntry JSON，frames 截断到 500
);
CREATE INDEX request_traces_by_time ON request_traces (started_at DESC);
```

- [x] **Step 1: 写失败测试**：开启持久化启动服务 → 回放 3 次 → 关闭 → 用同一数据目录重启 → `GET /api/requests` 仍返回 3 条，按时间倒序；`before` 游标翻页正确；超过 `maxEntries` 时最旧的被删除；`retainDays` 过期清理由 `TraceStore.prune(now)` 完成并单测覆盖。
- [x] **Step 2: 确认 RED**：`pnpm --filter @flowmock/server exec vitest run __tests__/control/timeline_test.ts` 失败。
- [x] **Step 3: 实现**：`Timeline.add` 在持久化开启时同步写入（`node:sqlite` 同步 API，单条 INSERT 开销可忽略）；内存环形缓冲区继续作为热缓存；`list` 与 `get` 在持久化开启时以数据库为准，确保筛选跨越热缓存、重启和保留清理后仍然一致；未开启时使用内存缓存。服务端每 10 分钟调用一次 `prune`，定时器在 `close()` 中清除。
- [x] **Step 4: 验证 GREEN**：`pnpm run verify`。
- [x] **Step 5: 提交**：`git commit -am "feat(server): persist the request timeline on demand"`

---

### Task 4: 托管前端静态产物

**Files:**
- Create: `apps/server/src/static-web.ts`（参考移植 Floway `apps/platform-node/src/static-web.ts`，文件头注明来源并登记 `NOTICE.md`）
- Modify: `apps/server/src/server.ts`（`getRequestListener` 的 fetch 先经过静态处理器）
- Modify: `apps/server/src/main.ts`（`FLOWMOCK_WEB_DIST_DIR`，默认 `apps/web/dist/client`，相对 `apps/server` 包目录解析）
- Test: `apps/server/__tests__/static-web_test.ts`

**Interfaces:**
- `isServerPath(pathname)`：`/api`、`/metrics`、`/v1`、`/v1beta`、`/messages`、`/chat/completions`、`/responses`、`/models` 及其子路径永远交给 Hono，包括 404。
- 其余 GET/HEAD：先找文件（`/assets/*` 带 `cache-control: public, max-age=31536000, immutable`），找不到且不是 `/assets/` 时回退 `index.html`（`no-cache`）；dist 不存在时返回 503 并提示先构建前端。
- 支持 `ETag`/`If-None-Match` 与 `304`；拒绝 `..` 路径穿越。

- [x] **Step 1: 写失败测试**：临时目录放 `index.html` 与 `assets/app-abc.js`，断言 `/` 与 `/scenarios/x` 返回 index、`/assets/app-abc.js` 带 immutable 缓存头、`/assets/missing.js` 404、`/v1/unknown` 走 Hono 404 JSON、`/%2e%2e/secret` 404、带 `If-None-Match` 返回 304。
- [x] **Step 2: 确认 RED**。
- [x] **Step 3: 实现**（流式读文件用 `Readable.toWeb(createReadStream(path))`）。
- [x] **Step 4: 验证 GREEN 并提交**：`git commit -am "feat(server): serve the management app's static build"`

---

### Task 5: 优雅停机

**Files:**
- Modify: `apps/server/src/server.ts`（`close({ graceMs })`）
- Modify: `apps/server/src/main.ts`（SIGINT/SIGTERM 使用 `FLOWMOCK_SHUTDOWN_GRACE_MS`，默认 10000；第二次信号立即退出）
- Modify: `apps/server/src/data-plane/http.ts`、`apps/server/src/data-plane/websocket.ts`（登记进行中的回放与录制）
- Create: `apps/server/src/state/inflight.ts`
- Test: `apps/server/__tests__/shutdown_test.ts`

**Interfaces:**
- `InflightTracker`：`track<T>(work: Promise<T>): Promise<T>`、`drain(timeoutMs): Promise<{ drained: boolean; remaining: number }>`。

- [x] **Step 1: 写失败测试**：场景 `synthetic ttftMs: 400` 发起流式请求，收到响应头后立刻调用 `close({ graceMs: 2000 })`，断言客户端完整读到 `message_stop`，且 `close` 在流结束后才 resolve；第二个用例 `graceMs: 50` 时流被中断、`close` 在约 50ms 后 resolve。
- [x] **Step 2: 确认 RED**（当前 `close` 立即 `closeAllConnections`）。
- [x] **Step 3: 实现**：先 `server.close()` 停止接受新连接，再 `inflight.drain(graceMs)`，超时后 `closeAllConnections()` 并终止 WS 客户端；录制中的交换在超时被切断时照常以 `truncated` 落库。
- [x] **Step 4: 验证 GREEN 并提交**：`git commit -am "feat(server): drain in-flight streams on shutdown"`

---

### Task 6: 类型化客户端契约

**Files:**
- Modify: `apps/server/src/control/routes.ts`（确保所有路由链式声明且返回 `c.json(...)` 带状态码，以便 `hc` 推断）
- Create: `apps/server/__tests__/control/app-type_test.ts`

- [x] **Step 1: 写测试**：用 `hc<AppType>(`${flowmock.url}/api`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } })` 调用 `scenarios.$get()`、`scenarios[':name'].preview.$post(...)`、`keys.$post(...)`，对返回 JSON 的字段做类型层与运行时双重断言（类型层用 `expectTypeOf` 断言 `items[number].name` 为 `string`）。
- [x] **Step 2: 确认类型错误或运行失败**（若当前推断已完整，则此步记录为“已满足”，仍保留测试防回归）。
- [x] **Step 3: 补齐**：把 `ConfigError` 等抛出路径改为显式 `c.json(..., status)`，避免 `hc` 把所有错误推断为 `unknown`。
- [x] **Step 4: 验证并提交**：`git commit -am "test(server): pin the typed control-plane client contract"`

---

### Task 7: 语料管理接口补充

**Files:**
- Modify: `apps/server/src/store/corpus-store.ts`、`apps/server/src/control/routes.ts`
- Test: `apps/server/__tests__/control/corpus_test.ts`

- [x] **Step 1: 写失败测试**：`GET /api/recordings?q=weather` 在请求体 JSON 中做大小写不敏感的子串搜索；`POST /api/recordings/delete {ids}` 批量删除并返回删除数；`GET /api/recordings?before=<id>` 游标分页；`GET /api/stats` 返回各协议、outcome、模型的录制数与总字节数。
- [x] **Step 2: 确认 RED**。
- [x] **Step 3: 实现**：`q` 使用 `instr(lower(json_extract(request, '$.body')), lower(?)) > 0`，仅搜索正文；批量删除在一个事务中删除行，块文件逐个删除；统计用 `GROUP BY`。
- [x] **Step 4: 验证并提交**：`git commit -am "feat(server): search, page and bulk-delete the corpus"`

---

## 阶段验收

- [x] `pnpm run verify` 通过。
- [x] 手工验证：`pnpm start -- --config examples/flowmock.yaml` 后用 curl 登录拿到 session，`curl -N -H 'x-flowmock-admin-session: …' /api/live` 每秒输出快照；对 `fm-demo-replay` 发请求时 `/api/requests/stream` 出现对应事件。
- [x] 开启持久化后重启，时间线保留。

## 实施记录（2026-10-04）

- 七项任务已分别提交在 `codex/phase-6-control-plane`；Floway 参考修订为 `c7e4d782763b010e44ba243588f2c83c90c97335`，仅移植静态托管模块，来源已登记到 `NOTICE.md`。
- 本地 Node 24.14.1 执行根 `pnpm run verify`，38 个测试文件、235 个测试全部通过；新增测试覆盖 token 哈希/续期/撤销、SSE 清理、时间线重启/分页/容量/过期/帧上限、静态缓存/越界、HTTP 与 WS 正常/超时停机、hc 输入输出与错误状态、批量删除事务/文件/缓存及并发读取竞态。
- 实际以 `pnpm start -- --config examples/flowmock.yaml` 启动，使用临时数据目录和环境变量开启鉴权/持久化。curl 验证登录、两路 SSE、`fm-demo-replay` 回放；19 条示例录制载入，重启后请求 id 与管理 session 保留，两次 SIGTERM 正常退出（0）。
- 正常 WS 停机等待最后事件的发送回调并在剩余宽限期内关闭握手；超时后切断连接，但等待录制收尾再关闭 SQLite。管理 SSE 主动清理，停机后的 WS 新 turn 返回 503。
- 语料普通列表按 `(created_at DESC, id DESC)` 稳定分页，cassette 筛选保持原有序号顺序。`total` 表示筛选后的总录制数，不随游标缩减。统计字节数为响应正文块的总大小。
- `hc` 通过路由边界的 schema 推断 JSON 输入（默认参数可省略）与查询参数；修正 ESLint 的 type-only 导出例外，运行时导入仍被禁止。
- 新增运行配置均支持环境变量优先于 YAML；README 已说明默认值及接口。UI 包、管理前端和其他后续阶段保持在各自计划中。
