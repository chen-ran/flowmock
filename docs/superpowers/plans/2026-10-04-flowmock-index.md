# FlowMock 后续实施计划总览

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已完成的服务端 MVP 之上，补齐控制面、UI 包与管理平台，扩展变换与协议保真度，并完成跨协议回放、多核压测和容器化等可选项。

**Architecture:** 仓库 `~/Code/flowmock` 是 pnpm workspace。`packages/protocols`（协议线格式与 reducer）→ `packages/core`（与运行时无关的引擎）→ `apps/server`（Node 数据面、录制代理、控制面）。后续新增 `packages/ui`（Fluent/WinUI 封装与通用控件）和 `apps/web`（React Router SPA 管理平台），前端只通过 `@flowmock/server/app-type` 的类型和 `/api` HTTP 接口与服务端交互。

**Tech Stack:** Node 22.19+/24、TypeScript 5.9、pnpm 10、Hono 4 + `@hono/node-server`、`ws`、`undici`、`node:sqlite`、zod 4、yaml、Vitest 4；前端阶段增加 React 19、React Router 8（SPA）、Fluent UI v9、`@fluentui/react-charts`、i18next、Monaco + monaco-yaml、UnoCSS、Vite 8。

## 当前状态（2026-10-05，阶段 7 完成）

最初设计计划（九个阶段，计划文件本身不纳入仓库，阶段划分见下表）的 1–7 阶段已经完成。`pnpm run verify`（lint、typecheck、370 个测试）在本地 Node 24.14.1 全部通过。

| 原阶段 | 状态 | 交付内容 |
|---|---|---|
| 1 仓库脚手架 | 完成 | pnpm workspace、TS 基础配置、ESLint（含 `packages/*` 运行时无关约束）、Vitest projects、`verify` 聚合脚本、CI（Node 22/24）、README、MIT LICENSE、NOTICE.md、AGENTS.md |
| 2 协议包 | 完成 | 移植四种协议的类型、stream parser、collect reducer；新增保留原始字节跨度的 `SseDecoder`、Gemini JSON 数组流解码器与编码器 |
| 3 引擎 | 完成 | 语料分析（outcome、usage、TTFT/TPS）、四协议请求规范化与指纹、match/prefix/sequence/sample 选取、变换注册表、rewrite/timing/fault/network 变换、回放计划、runner、`Clock`/`HttpTransport`/`MessageTransport`/`CorpusStore` 契约、假时钟测试 |
| 4 服务端回放 | 完成 | 五种数据面入口（含 Responses WS 多轮与 `previous_response_id` 记忆）、逐字节调度、FIN/abort/RST/hang、`node:sqlite` 迁移与 `.fmc` 块文件、`/v1/models` 与 Gemini models、真实 socket 集成测试（官方 Anthropic/OpenAI/GenAI SDK） |
| 5 录制代理 | 完成 | HTTP 与 WS 转发、逐块计时、鉴权头脱敏、gzip/br 解码、cassette 自动归档、录制先落盘再结束响应 |
| 6 控制面 | 完成 | Bearer 与持久化管理 session；语料/cassette/场景/key/目标 CRUD；语料搜索/分页/批量删除/统计；场景预览；时间线可选落库；两路实时 SSE；静态托管；HTTP/WS 优雅停机；类型化客户端契约；原有 metrics/schema/导入导出/配置 |
| 7 UI 包 | 完成 | `packages/ui`：WinUI 重塑层与唯一 Fluent 入口（ESLint 强制）、主题与全局样式、样式表虚拟模块插件与 UnoCSS 预设、类型化 i18n 工厂与 `ui` 文案、通用控件、懒加载的正文与 YAML 编辑器、图表与补丁、开发画廊；与 Floway 画廊逐像素一致；Fluent 家族固定在验证过的版本 |
| 8 管理平台 | 完成 | `apps/web`：管理 key 登录、外壳与设置；语料与 cassette（帧/数据块/token 时间轴）；场景 YAML 与表单双向同步（逐字节保留注释与写法）及未保存预览；key 与目标、客户端片段；实时监控（SSE 退避重连）；请求时间线与按来源着色的追踪；概览；en/zh-Hans 等价与键使用检查；Monaco 懒加载、语言包拆分、画廊仅限开发的产物检查 |
| 9 可选 | 未开始 | 见阶段 9 计划 |

## 阶段与验收门

| 阶段 | 计划 | 可独立验收结果 |
|---|---|---|
| 6 | [控制面补完](2026-10-04-flowmock-phase-6-control-plane.md) | 管理密钥换取 session；实时指标与时间线 SSE；时间线可选落库；服务端托管 `apps/web` 静态产物；优雅停机等待进行中的流 |
| F | [协议保真度与变换 v2](2026-10-04-flowmock-fidelity-and-transforms-v2.md) | 无样本时可按协议合成错误；非流式录制可服务流式请求；按 token 截断、内容改写、模板响应；Responses WS `previous_response_not_found`；TPM/RPM 限流 |
| 7 | [UI 包 `packages/ui`](2026-10-04-flowmock-phase-7-ui-package.md) | Fluent/WinUI 封装、通用控件、charts、类型化 i18n 工厂与构建辅助可被应用消费；Fluent 值导入只能经过 `packages/ui/src/fluent.ts`（ESLint 强制） |
| 8 | [管理平台 `apps/web`](2026-10-04-flowmock-phase-8-web.md) | 语料、cassette、场景（YAML + 表单 + 预览）、key 与目标、实时监控、请求时间线、设置页面可用；en/zh-Hans 结构等价；构建产物检查通过 |
| 9 | [跨协议回放、多核压测与容器化](2026-10-04-flowmock-phase-9-optional.md) | 协议 A 的录制可以协议 B 返回；`node:cluster` 多核；解码缓存；Docker 镜像 |

依赖关系：6 与 F 互不依赖，可并行；7 依赖 6 的 session 与静态托管（只依赖接口形状，可先行开发）；8 依赖 6 与 7；9 中跨协议回放依赖 F 的“非流式合成流”能力，其余项独立。

## 全局约束

- 每个阶段在独立分支上完成，按任务提交，提交信息使用英文 Conventional Commits；合并前 `pnpm run verify` 必须全绿。
- 遵循仓库根 `AGENTS.md` 的全部要求，尤其是：`packages/*` 不得引用 Node 内置模块、定时器和 `process`；所有随机选择都从种子派生；错误体、错误头和流中错误事件默认来自真实录制，不得在没有显式配置的情况下凭空合成；每次改写都记录 provenance。
- 测试放在各包 `__tests__/` 下并镜像源码目录；跨包共享的录制样本统一放在 `@flowmock/test-fixtures`。
- 新增厂商线格式常量时附带参考链接（官方文档或 SDK 源码固定提交的永久链接）。
- 从 Floway 移植代码时在文件头注明来源，并在 `NOTICE.md` 的移植表中登记；只移植当前任务需要的部分。
- 前端用户可见字符串全部经过类型化 i18n 边界，`en` 与 `zh-Hans` 结构等价。
- 不修改 Floway 仓库。

## 已冻结的接口（后续阶段只能向后兼容扩展）

```ts
// packages/core/src/contracts.ts
export interface Clock { now(): number; sleepUntil(deadline: number, signal?: AbortSignal): Promise<void> }
export interface HttpTransport { readonly signal: AbortSignal; writeHead(status: number, headers: ReadonlyArray<readonly [string, string]>): void; write(bytes: Uint8Array): Promise<void>; end(): Promise<void>; abort(): void; reset(): void }
export interface MessageTransport { readonly signal: AbortSignal; send(text: string): Promise<void>; close(code: number, reason: string): void; terminate(): void }
export interface CorpusStore { listCandidates(protocol: Protocol): Promise<readonly RecordingSummary[]>; getRecording(id: string): Promise<Recording | null>; getCassette(id: string): Promise<Cassette | null> }

// packages/core/src/engine.ts
export const prepareRequest: (input: PrepareInput) => PreparedRequest;
export const planReplay: (request: PreparedRequest, context: ReplayContext, store: CorpusStore) => Promise<ReplayOutcome>;

// packages/core/src/transforms/registry.ts
export const registerTransform: <Config>(definition: TransformDefinition<Config>) => void; // stage: content | timing | fault | network
```

- 场景 schema：`packages/core/src/scenario/schema.ts` 的 `scenarioSchema`。新增字段必须有默认值，旧 YAML 不需修改即可通过校验。
- 可移植语料格式：`flowmock.cassette/v1`、`flowmock.recording/v1` 两种 NDJSON 行（`apps/server/src/control/portable.ts`）。格式变化时增加 `v2`，导入端同时接受 `v1`。
- 块文件格式：`FMC1` 魔数 + `(float64 t, uint32 length, bytes)*`（`apps/server/src/store/chunk-files.ts`）。
- 数据面覆盖头：`x-flowmock-scenario`、`x-flowmock-seed`、`x-flowmock-session`，以及 `model@scenario` 后缀。

## MVP 已知差距（分配到各阶段）

| 差距 | 归属 |
|---|---|
| 管理 API 支持 Bearer 与浏览器 session | 阶段 6 已完成 |
| 时间线默认内存模式，可选持久化并保留 500 帧摘要 | 阶段 6 已完成 |
| 进程退出时在宽限期内等待 HTTP/WS 流，超时录制先落库 | 阶段 6 已完成 |
| 没有对应状态码的录制样本且未给出 `status` 时，`http_error` 报 FlowMock 诊断错误，不合成 | F |
| 只有非流式录制时无法服务流式请求（选取阶段直接过滤） | F |
| Responses WS 对未知 `previous_response_id` 宽松处理，不返回 `previous_response_not_found` | F |
| 只有并发上限，没有 RPM/TPM 限流 | F |
| 每次回放都重新解码录制帧，压测时 CPU 开销偏高 | 阶段 9 |
| 跨协议回放、多核、Docker 镜像 | 阶段 9 |
