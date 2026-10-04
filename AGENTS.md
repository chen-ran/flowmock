# Repository Agent Guide

## Requirements

| Scope | Requirement | Enforcement |
|---|---|---|
| Task scope | Derive every action from the user's request and preserve unrelated working-tree state. | Final diff review |
| Completion | Run `pnpm run verify` and read its output before claiming completion. | Verification output |
| Verification inventory | Chain every check from the root `verify` script; CI runs exactly `verify`. | `.github/workflows/verify.yaml` |
| Test placement | Place package tests under `__tests__/` mirroring `src/`; shared fixtures live in `@flowmock/test-fixtures`. | Vitest configs |
| Runtime independence | Keep `packages/*` free of Node built-ins, timers and globals; reach the runtime through the `Clock`, `HttpTransport`, `MessageTransport` and `CorpusStore` contracts. `packages/ui` is browser code and may use browser timers. | ESLint |
| UI boundaries | Take Fluent values only from `@flowmock/ui/fluent`, toast state only in `packages/ui/src/winui/toaster.tsx`, and `react-i18next` only through the typed boundary; keep `packages/ui` free of FlowMock domain packages. | ESLint |
| Package boundaries | Import other packages through their exports maps; `apps/server` exposes only the type-only `./app-type`. | ESLint |
| Replay fidelity | Replay recorded bytes unless a scenario transform changes them, and record every change as provenance. | Core and server tests |
| Recorded errors | Take error bodies, headers and events from recordings or explicit scenario overrides; never invent them silently. | Engine tests |
| Determinism | Draw every random choice from a seeded stream derived from the request seed, session and call index. | Core tests |
| Credentials | Redact client credentials before a recording is stored; mask target secrets in admin responses. | Server tests |
| Ported code | Name the Floway origin in a header comment of every ported file and list it in `NOTICE.md`. | Review |
| Vendor constants | Attach a reference URL to every vendor wire shape and workaround. | Review |
| Error behavior | Propagate failures with their original error; answer clients with protocol-shaped errors. | Tests |
| Plans | Keep follow-up work as Superpowers plans under `docs/superpowers/plans`. | Review |

## Index

| Category | Entry | Overview |
|---|---|---|
| CI | `.github/workflows/verify.yaml` | Runs `pnpm run verify` on Node 22 and 24. |
| Docs | `docs/superpowers/plans` | Post-MVP implementation plans. |
| Examples | `examples` | Example configuration, scenarios and the demo corpus. |
| Package | `apps/server` | Serves the data plane, recording proxy and admin API on Node. |
| Package | `packages/core` | Selects, transforms, plans and runs replays. |
| Package | `packages/protocols` | Defines wire types, decoders and reducers. |
| Package | `packages/test-fixtures` | Provides recorded exchanges for tests. |
| Package | `packages/ui` | Provides the Fluent/WinUI layer, generic controls, charts and the typed i18n boundary. |
