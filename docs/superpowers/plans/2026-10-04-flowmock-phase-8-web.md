# FlowMock 阶段 8：管理平台 `apps/web` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `packages/ui` 构建 FlowMock 管理平台：语料浏览（含帧与块的时间轴、token 随时间曲线）、cassette 与录制会话、场景编辑（YAML + 表单 + 保存前预览）、key 绑定与录制目标、实时监控、请求时间线、设置，提供 en / zh-Hans 两种语言。

**Architecture:** `apps/web` 是 React Router 8 SPA（`ssr: false`，根路由构建时预渲染为带启动画面的 `index.html`），产物输出到 `apps/web/dist/client`，由 `apps/server` 在同一源下托管（阶段 6 Task 4）。前端只通过 `hc<AppType>`（`@flowmock/server/app-type` 的类型）调用 `/api`，实时数据走 `/api/live` 与 `/api/requests/stream` 两个 SSE。所有 Fluent 组件经 `@flowmock/ui/fluent` 获取，所有文案经 `@flowmock/ui/i18n` 的类型化边界。

**Tech Stack:** React 19、React Router 8、Vite 8、`@flowmock/ui`、Fluent UI v9、`@fluentui/react-charts`、i18next、Monaco + monaco-yaml、zustand（仅会话与偏好）、Vitest + happy-dom + `@testing-library/react`。

## Global Constraints

- 遵循 [总览](2026-10-04-flowmock-index.md) 的全部全局约束，以及阶段 7 的 Fluent 与 i18n 边界规则（ESLint 强制）。
- 运行时只能导入浏览器安全的模块；对 `@flowmock/server` 只允许 `import type`（ESLint `no-restricted-syntax` 强制，规则写法同 Floway 的 `@floway-dev/gateway` 限制）。
- 领域组件放在 `apps/web/src/components/<domain>/`，不得放进 `packages/ui`。
- 每个页面任务都要：组件测试（假 API）→ 浏览器中真实打开验证（开发与生产构建各一次，亮暗主题，en 与 zh-Hans）→ `pnpm run verify` → 提交。
- 阶段 7 的实际接口见其计划末尾的实施记录：控件、图表与 WinUI 内部模块经带扩展名的子路径导入（`@flowmock/ui/controls/panel.tsx`）；挂载 `useSystemTheme()` 返回的主题；文案边界用 `createTranslation<typeof en['translation']>()` 建立，`initI18n` 返回 `{ i18n, setLanguage }`；Monaco 编辑器只经 `@flowmock/ui/controls/lazy-editors.ts` 使用。
- 时间一律以服务端返回的毫秒值为准，显示时按浏览器本地时区格式化；图表与时间轴的数值不得在前端重新计算 TTFT/TPS，直接使用服务端的 `expected` 与 `result`。

---

### Task 1: 应用脚手架

**Files:**
- Create: `apps/web/package.json`、`tsconfig.json`、`vite.config.ts`（使用 `@flowmock/ui/vite` 的 `typescriptStylesheets(FLOWMOCK_STYLESHEETS)`；开发代理 `/api`、`/metrics`、`/v1`、`/v1beta` 到 `FLOWMOCK_DEV_SERVER`，默认 `http://127.0.0.1:8787`）、`react-router.config.ts`、`uno.config.ts`（`presets: [presetFlowmock()]`——预设已包含 `presetWind3`；`content.filesystem` 同时列出本应用源码与 `UI_CONTENT_GLOBS`）、`postcss.config.ts`（UnoCSS 与 `legacyCssColors`）、`vitest.config.ts`
- Create: `apps/web/src/{root.tsx,routes.ts,entry.client.tsx,global.css}`、`apps/web/src/i18n/{index.ts,locales/en.ts,locales/zh-Hans.ts,translation.ts}`
- Modify: `eslint.config.ts`（加入 `apps/web/tsconfig.json`，`@flowmock/server` 只能类型导入）
- Modify: 根 `package.json`（`build:web`、`dev:web`；`verify` 追加 `build:web`）
- Test: `apps/web/__tests__/root_test.tsx`

- [ ] **Step 1: 写测试**：渲染 `Layout` 与一个空路由，断言 `FluentProvider` 存在、`html[lang]` 为 `en`、WinUI 样式表 `<link>` 在关键 CSS `<style>` 之后。
- [ ] **Step 2: 确认 RED，创建脚手架。**
- [ ] **Step 3: 构建验证**：`pnpm --filter @flowmock/web run build` 产出 `dist/client/index.html` 与带哈希的资源；用阶段 6 的静态托管启动服务端并在浏览器打开，看到启动画面后进入空白首页。
- [ ] **Step 4: 验证并提交**：`pnpm run verify`；`git commit -am "feat(web): scaffold the management app"`

---

### Task 2: API 客户端、登录与路由守卫

**Files:**
- Create: `apps/web/src/api/client.ts`（`hc<AppType>('/api', { fetch: authFetch })`，统一 `ApiResult<T>` 结果类型，移植 Floway `api/client.ts` 的思路）
- Create: `apps/web/src/auth/session.ts`（session token 存 `localStorage`，键 `flowmock.adminSession`；401 时清除并跳转登录）
- Create: `apps/web/src/routes/login.tsx`、`apps/web/src/components/login-form.tsx`
- Test: `apps/web/__tests__/api/client_test.ts`、`apps/web/__tests__/components/login-form_test.tsx`

**Interfaces:**
- 请求头 `x-flowmock-admin-session: <token>`；SSE 连接以 `?session=<token>` 传递。
- `/api/auth/me` 返回 `{via: 'open'}` 时跳过登录页（本地无管理密钥模式）。

- [ ] **Step 1: 写测试**（用 `vi.stubGlobal('fetch', …)` 模拟：登录成功写入 token；401 清除 token 并导航到 `/login`；`open` 模式直接进入首页）。
- [ ] **Step 2: 确认 RED，实现，浏览器验证（错误密钥显示本地化错误、成功后进入首页），提交**：`git commit -am "feat(web): sign in with the admin key"`

---

### Task 3: 外壳、导航与设置

**Files:**
- Create: `apps/web/src/components/sidebar/{nav.tsx,pages.ts}`、`apps/web/src/components/page-frames.tsx`、`apps/web/src/components/language-selector.tsx`
- Create: `apps/web/src/routes/{dashboard.tsx,settings.tsx}`
- Test: `apps/web/__tests__/components/sidebar_test.tsx`、`apps/web/__tests__/routes/settings_test.tsx`

配色跟随系统，不提供亮/暗覆盖（与 Floway 一致：WinUI 的 `--winui-*` 词典按 `prefers-color-scheme` 切换）；亮暗两种主题的浏览器验证通过切换系统或浏览器外观完成。

导航结构：概览 `/`、语料 `/corpus`、Cassette `/cassettes`、场景 `/scenarios`、Key 与目标 `/keys`、实时监控 `/monitor`、请求时间线 `/requests`、设置 `/settings`。设置页：语言（en / 简体中文，存偏好）、服务端版本（`/api/health`）、时间线持久化状态、退出登录。

- [ ] **Step 1: 写测试（导航高亮当前页；切换语言后文案变化且偏好持久化；退出登录清除 session）。**
- [ ] **Step 2: 确认 RED，实现，浏览器验证，提交**：`git commit -am "feat(web): add the shell, navigation and settings"`

---

### Task 4: 语料页面

**Files:**
- Create: `apps/web/src/routes/{corpus.tsx,corpus-detail.tsx}`
- Create: `apps/web/src/components/corpus/{filters.tsx,list.tsx,detail-header.tsx,frame-timeline.tsx,chunk-timeline.tsx,token-curve.tsx,request-view.tsx}`
- Test: `apps/web/__tests__/components/corpus/{list_test.tsx,frame-timeline_test.tsx,token-curve_test.ts}`

**Interfaces（来自服务端）:** `GET /api/recordings`（`protocol`、`model`、`outcome`、`cassette`、`q`、`before`、`limit`）、`GET /api/recordings/:id`（含 `frames: [{t, kind, event, raw, content, contentChars, error}]` 与 `response.chunks: [{t, bytes}]`）、`GET /api/recordings/:id/body`、`DELETE /api/recordings/:id`、`POST /api/recordings/delete`。

页面要点：
- 列表列：时间、协议、模型、outcome（状态徽章：`ok` 成功色，`http_error:*` 错误色，`stream_error:*` 警告色，`truncated`/`client_aborted` 中性）、流式、TTFT、TPS、输出 token、工具调用数、cassette。筛选条件写入 URL 查询参数。
- 详情页：请求（头与体，用 `body-editor` 只读展示）、响应元数据、特征摘要、**帧时间轴**（横轴毫秒，每帧一个刻度，内容帧与非内容帧不同样式，错误帧突出显示，悬停显示事件名与 raw 前 200 字符）、**块时间轴**（每个到达块一个刻度，高度表示字节数）、**token 随时间曲线**（按 `contentChars` 比例把 `features.outputTokens` 分摊到内容帧后累计，曲线与 TTFT/TPS 标注一致）。
- `token-curve.ts` 的分摊算法与 `packages/core` 的 `allocateTokens` 相同——直接从 `@flowmock/core` 类型安全地导入该纯函数会把 core 拉进前端包，因此在服务端 `GET /api/recordings/:id` 的响应中增加 `frames[].tokens` 字段（服务端调用 `allocateTokens`），前端只画图。为此本任务包含对 `apps/server/src/control/routes.ts` 的小改动及其测试。

- [ ] **Step 1: 服务端补 `frames[].tokens`（先写 `control_test.ts` 断言，RED → 实现 → GREEN）。**
- [ ] **Step 2: 写前端组件测试**（列表筛选写入 URL；帧时间轴按 `t` 排列且错误帧有 `data-error`；曲线终点等于 `outputTokens`）。
- [ ] **Step 3: 确认 RED，实现，浏览器验证（用 `examples/demo-corpus.generated.ndjson` 导入的数据），提交**：`git commit -am "feat(web): browse recordings with frame and token timelines"`

---

### Task 5: Cassette 页面

**Files:**
- Create: `apps/web/src/routes/{cassettes.tsx,cassette-detail.tsx}`、`apps/web/src/components/cassettes/{list.tsx,sequence.tsx}`
- Test: `apps/web/__tests__/components/cassettes/sequence_test.tsx`

列表：名称、创建时间、key、目标、session、录制数、是否关闭。详情：按序号排列的录制（序号、时间间隔、outcome、stop reason），操作：重命名、关闭（下次请求开新 cassette）、导出（`/api/export?cassette=`，浏览器下载 `.ndjson`）、删除（可选连同录制）、“用此 cassette 创建顺序回放场景”（生成 `selection: { mode: sequence, cassette: <id> }` 的 YAML 并跳转到场景编辑器）。

- [ ] **Step 1: 写测试，确认 RED，实现，浏览器验证，提交**：`git commit -am "feat(web): manage cassettes and turn one into a sequence scenario"`

---

### Task 6: Key 绑定与录制目标

**Files:**
- Create: `apps/web/src/routes/keys.tsx`、`apps/web/src/components/keys/{key-list.tsx,key-dialog.tsx,target-list.tsx,target-dialog.tsx,client-snippets.tsx}`
- Test: `apps/web/__tests__/components/keys/{key-dialog_test.tsx,client-snippets_test.ts}`

要点：key 绑定 `record: <target>` 或 `replay: <scenario>` 二选一（表单用 `choice-group`）；目标头部的密钥用 `secret-input` 输入，列表只显示服务端返回的掩码；“客户端配置”为每个 key 生成可复制片段：Anthropic SDK、OpenAI SDK、Google GenAI SDK、curl、Claude Code（`ANTHROPIC_BASE_URL` 与 `ANTHROPIC_API_KEY`）、Codex（`~/.codex/config.toml` 的 `model_providers` 段，`wire_api = "responses"`），基地址取 `window.location.origin`。

- [ ] **Step 1: 写测试（片段中的基地址与 key 正确；OpenAI 片段带 `/v1`；目标表单拒绝非 http(s) URL）。**
- [ ] **Step 2: 确认 RED，实现，浏览器验证，提交**：`git commit -am "feat(web): bind keys, configure targets and copy client snippets"`

---

### Task 7: 场景编辑（YAML + 表单 + 预览）

**Files:**
- Create: `apps/web/src/routes/{scenarios.tsx,scenario-editor.tsx}`
- Create: `apps/web/src/components/scenarios/{yaml-editor.tsx,form/selection.tsx,form/timing.tsx,form/network.tsx,form/faults.tsx,form/model.ts,preview-panel.tsx,plan-timeline.tsx,sample-request-picker.tsx}`
- Test: `apps/web/__tests__/components/scenarios/{form-model_test.ts,yaml-sync_test.tsx,preview-panel_test.tsx,plan-timeline_test.tsx}`

**Interfaces:**
- YAML 编辑器：Monaco + monaco-yaml，JSON Schema 来自 `GET /api/schema/scenario`（启动时取一次并缓存），Monaco 必须懒加载。
- 表单与 YAML 双向同步：`form/model.ts` 定义 `scenarioToForm(yamlDocument)` 与 `applyForm(yamlDocument, form)`，使用 `yaml` 包的 `Document` API 修改节点以**保留注释与未在表单中出现的字段**（例如 `transforms`）。表单覆盖：`selection.mode`、`selection.cassette`、`timing`（模式、分布类型与参数）、`network` 全部字段、`faults` 列表（触发条件与注入类型的常用字段）。
- 预览：`sample-request-picker` 从语料中挑一条录制的请求（或粘贴 JSON 与路径），调用 `POST /api/scenarios/:name/preview`（未保存的修改先用 `PUT` 到临时名 `__preview__<随机>`，预览后删除；或在阶段 6 中为 preview 增加 `source` 字段直接传 YAML——**本任务选择后者**，并包含对服务端的小改动与测试）。展示选中的录制与选取方式、命中的故障、provenance 列表、计划写入时间轴（与 Task 4 的帧时间轴共用组件，内容写入与非内容写入不同样式，标出 `expected.ttftMs`、结束动作）、预期 TTFT/TPS。种子与调用序号可调，便于观察“第 3 次调用 429”这类规则。
- 保存：`PUT /api/scenarios/:name`（body 为 YAML 文本），服务端校验错误以内联标记显示在 Monaco 中（错误消息里的路径映射到 YAML 节点位置）。

- [ ] **Step 1: 服务端 `preview` 支持 `source`（YAML 文本）——写 `control_test.ts` 用例：未保存的 YAML 预览得到与保存后相同的结果；非法 YAML 返回 400 与路径。RED → 实现 → GREEN。**
- [ ] **Step 2: 写 `form-model_test.ts`**：对 `examples/scenarios/weak-network-429.yaml` 往返（`scenarioToForm` → `applyForm` 不改任何值）后文本逐字节相同；修改 `timing.tps.mean` 后只有该行变化且注释保留。
- [ ] **Step 3: 写其余组件测试，确认 RED，实现。**
- [ ] **Step 4: 浏览器验证**：编辑 `weak-network-429`，切换调用序号 3 时预览显示 429 与样本录制；非法值显示内联错误；生产构建下首屏不加载 Monaco（网络面板确认）。
- [ ] **Step 5: 验证并提交**：`git commit -am "feat(web): edit scenarios as YAML or forms and preview their plans"`

---

### Task 8: 实时监控

**Files:**
- Create: `apps/web/src/routes/monitor.tsx`、`apps/web/src/components/monitor/{use-live.ts,ttft-chart.tsx,tps-chart.tsx,throughput-chart.tsx,fault-chart.tsx,summary-cards.tsx}`
- Test: `apps/web/__tests__/components/monitor/use-live_test.ts`

`use-live.ts` 订阅 `/api/live`（`EventSource`，`?session=`），在内存中保留最近 10 分钟的快照用于画图，断线后指数退避重连并在页面上提示；页面在不可见时暂停订阅（复用 `use-poll-while-visible` 的可见性逻辑）。图表：TTFT p50/p90/p99、TPS p50/p90/p99、RPS 与活跃请求数、按类型堆叠的故障计数，全部使用 `@flowmock/ui/charts/*`。

- [ ] **Step 1: 写测试（用假 `EventSource` 推送快照，断言缓冲窗口裁剪、重连退避、隐藏时关闭连接）。**
- [ ] **Step 2: 确认 RED，实现，浏览器验证（对 `fm-demo-weak-network` 循环发请求时曲线变化），提交**：`git commit -am "feat(web): monitor live TTFT, TPS and faults"`

---

### Task 9: 请求时间线

**Files:**
- Create: `apps/web/src/routes/{requests.tsx,request-detail.tsx}`、`apps/web/src/components/requests/{list.tsx,filters.tsx,trace-view.tsx,provenance.tsx,timing-compare.tsx}`
- Test: `apps/web/__tests__/components/requests/{list_test.tsx,trace-view_test.tsx}`

列表通过 `/api/requests/stream` 实时追加（可暂停），筛选：模式、key、协议、状态、outcome。详情：请求元数据、选取方式（exact/prefix/sequence/sample 及其参数）、命中的故障规则、provenance、帧时间轴（按 `origin` 着色：recorded / rewritten / reencoded / collected / injected / synthesized，图例本地化）、计划与实测对比（`expected` 对 `result.achievedTtftMs`、`achievedTps`、`endedAt`）、种子与 session（附“用此种子重放”的 curl 片段，带 `x-flowmock-seed`、`x-flowmock-session`）。

- [ ] **Step 1: 写测试，确认 RED，实现，浏览器验证，提交**：`git commit -am "feat(web): inspect every replay's trace and timing"`

---

### Task 10: 概览页与 i18n 完整性

**Files:**
- Create: `apps/web/src/routes/index.tsx`（语料统计 `/api/stats`、实时摘要卡片、最近 10 条请求）
- Create: `apps/web/__tests__/i18n/{parity_test.ts,key_usage_test.ts}`（移植 Floway 思路：每个英文键都被源码使用；源码里的字面量键都存在；zh-Hans 与 en 结构等价，使用 `@flowmock/ui/i18n` 的 `assertLocaleParity`）

- [ ] **Step 1: 写测试，确认 RED，实现，提交**：`git commit -am "feat(web): add the overview page and locale completeness checks"`

---

### Task 11: 构建产物检查

**Files:**
- Create: `apps/web/scripts/{check-monaco-lazy.ts,check-locales-split.ts,check-gallery-dev-only.ts}`（参考 Floway 同名脚本）
- Modify: `apps/web/package.json`（`build` 链接 `check:build-output`）、根 `package.json`

- [ ] **Step 1: 写脚本**：入口 chunk 与其静态依赖中不得出现 `monaco-editor`；`en` 与 `zh-Hans` 各自是独立 chunk；生产构建不包含 gallery 模块。
- [ ] **Step 2: 故意在入口静态导入 Monaco，确认检查失败（RED）；撤销后通过。**
- [ ] **Step 3: 提交**：`git commit -am "build(web): assert lazy Monaco, split locales and a gallery-free bundle"`

---

### Task 12: 文档与发布

**Files:**
- Modify: `README.md`（管理平台章节、截图、`pnpm run build:web` 与托管方式）、`AGENTS.md`（Index 增加 `apps/web`、`packages/ui`；Requirements 增加 Fluent 与 i18n 边界）

- [ ] **Step 1: 更新文档，`pnpm run verify` 通过后提交**：`git commit -am "docs: document the management app"`

---

## 阶段验收

- [ ] `pnpm run verify`（含 `build:web` 与产物检查）通过。
- [ ] 从零开始：`pnpm install && pnpm run build:web && pnpm start -- --config examples/flowmock.yaml`，浏览器打开 `http://127.0.0.1:8787`，完成“登录 → 查看语料详情 → 编辑并预览场景 → 用 key 片段发请求 → 在时间线与实时监控中看到它”的完整流程，en 与 zh-Hans、亮暗主题各走一遍。
