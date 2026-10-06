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
| `apps/web/{vite,react-router,postcss}.config.ts` | `apps/web/{vite,react-router,postcss}.config.ts` | FlowMock's server paths and ports; the stylesheet table, Prism plugin and legacy-colour policy come from `@flowmock/ui/vite`; the build bundles the prerender server graph whole. |
| `apps/web/src/{root,entry.client}.tsx`, `apps/web/src/critical.css.ts` | `apps/web/src/{root,entry.client}.tsx`, `apps/web/src/critical.css.ts` | FlowMock's title and icon; the error page shows the trace without source-map restoration. |
| `apps/web/src/components/{gradient-background,navigation-progress}{.tsx,.css.ts}`, `apps/web/src/components/language-sync.tsx` | `apps/web/src/components/*` (same names) | `floway` identifiers renamed `flowmock`. |
| `apps/web/src/i18n/{index,shell}.ts` | `apps/web/src/i18n/{index,resources,shell}.ts` | Initialization goes through `initI18n` from `@flowmock/ui/i18n`. |
| `apps/web/src/api/client.ts`, `apps/web/src/auth/session.ts`, `apps/web/src/lib/{error-message,error-payload}.ts` | same paths under `apps/web` | Typed against `@flowmock/server/app-type` under `/api`; FlowMock's admin session header and storage key. |
| `apps/web/src/stores/auth-store.ts`, `apps/web/src/routes/guards.ts` | same paths under `apps/web` | Hold how the server let the browser in (session, admin key or open) rather than a user; an unanswered server is an error, not a sign-in. |
| `apps/web/src/components/{login-form,language-selector,logo}.tsx`, `apps/web/src/routes/login.tsx` | `apps/web/src/components/*`, `apps/web/src/routes/home.tsx` | One admin-key field instead of a username and password; FlowMock's mark. |
| `apps/web/src/routes/dashboard.tsx`, `apps/web/src/components/{page-frames,document-title-sync}.tsx`, `apps/web/src/lib/{dashboard-route-handle,reduced-motion,use-locale}.ts` | same paths under `apps/web` | The shell holds how the browser was let in rather than a user, and leaves for the sign-in form when that is cleared. |
| `apps/web/src/components/sidebar/{nav.tsx,nav-selection-indicator.tsx,pages.ts}` | `apps/web/src/components/sidebar/*` | FlowMock's pages; settings in the footer; signing out offered only to a session. |
| `apps/web/__tests__/match-media-stub.ts`, `apps/web/__tests__/components/sidebar/nav-selection-indicator_test.tsx` | `apps/web/__tests__/match-media-stub.ts`, the indicator suite of `apps/web/__tests__/winui/motion_test.tsx` | Paths only. |
| `apps/web/__tests__/api/client_test.ts`, `apps/web/__tests__/routes/session-gate_test.ts` | same paths under `apps/web` | Adds the session header cases. |
| `eslint.config.ts` | `eslint.config.ts` | Trimmed to FlowMock's packages; adds the runtime-independence rules for `packages/*` and enforces the Fluent, toast and `react-i18next` import boundaries that Floway keeps by convention. |
| `packages/ui/__tests__/{setup,match-media-stub,local-storage-stub,settle}.ts` | `apps/web/__tests__/*` (same names) | Setup loads no app i18n and skips DOM preparation for Node-environment suites. |
| `packages/ui/src/fluent.ts`, `packages/ui/src/font-stacks.ts` | `apps/web/src/fluent.ts`, `apps/web/src/font-stacks.ts` | Comment wording. |
| `packages/ui/src/base-theme.ts` | `apps/web/src/theme.ts` | Renamed; `packages/ui/src/theme.ts` is FlowMock's public entry with `useSystemTheme`, taken from `apps/web/src/root.tsx`. |
| `packages/ui/src/critical.css.ts` | `apps/web/src/critical.css.ts` | Only the document rules; app components add their own sheets. |
| `packages/ui/src/lib/{color,legacy-css-color,use-media-query}.ts` | `apps/web/src/lib/*` (same names) | Unchanged. |
| `packages/ui/src/winui/**` | `apps/web/src/winui/**` | `floway` identifiers renamed `flowmock`; the color-picker sheet is not ported; comments point at FlowMock paths; optional chains in `switch-drag.tsx`. |
| `packages/ui/__tests__/render.tsx`, `packages/ui/__tests__/{winui,lib}/**` | `apps/web/__tests__/render.tsx`, `apps/web/__tests__/{winui,lib}/**` | `motion_test.tsx` keeps only the presence suite; the navigation indicator suite moves with the app shell. |
| `packages/ui/src/vite/typescript-stylesheets.ts` | `apps/web/vite.config.ts` (`typescriptStylesheets`) | Takes the virtual sheet table as an argument; module paths are absolute. |
| `packages/ui/src/vite/legacy-css.ts` | `apps/web/vite.config.ts`, `apps/web/postcss.config.ts` | The CSS build target and the legacy-colour PostCSS plugin as exports. |
| `packages/ui/src/vite/prism-components.ts` | `apps/web/vite.config.ts` (`prismComponentsEsm`, `optimizeDeps.exclude`) | The plugin and the component list as exports. |
| `packages/ui/src/uno/preset.ts` | `apps/web/uno.config.ts` | A preset over `presetWind3` without content globs; exports the package's own globs for an app to scan. |
| `packages/ui/src/global.css` | `apps/web/src/global.css` | `floway` identifiers renamed `flowmock`; comments point at FlowMock paths. |
| `packages/ui/src/assets/fonts/*` | `apps/web/src/assets/fonts/*` | Unchanged; see Meslo LG below. |
| `packages/ui/__tests__/vite/stylesheet-composition_test.ts` | `apps/web/__tests__/stylesheet-composition_test.ts` | Paths only. |
| `packages/ui/src/i18n/translation.tsx` | `apps/web/src/i18n/translation.tsx` | Generic over the app's English translation through `createTranslation`, merged with the package's `ui` namespace. |
| `packages/ui/src/i18n/init.ts` | `apps/web/src/i18n/index.ts` | `initI18n` takes the app's locale loader and shell, merges the `ui` strings into every bundle and returns `setLanguage`. |
| `packages/ui/src/i18n/{languages,number-format,resources}.ts`, `packages/ui/src/lib/format-number.ts` | `apps/web/src/i18n/*`, `apps/web/src/lib/format-number.ts` | `resources.ts` loads the `ui` locales; `format-number.ts` keeps the three interpolation formats. |
| `packages/ui/src/i18n/language-preference.ts` | `apps/web/src/i18n/language-preference.ts` | Storage key `flowmock-language`. |
| `packages/ui/src/i18n/parity.ts` | `apps/web/__tests__/i18n/{keys,resources_test}.ts` | The resource checks as one reusable `assertLocaleParity`. |
| `packages/ui/src/i18n/locales/*` | strings from `apps/web/src/i18n/locales/*` | The control strings under `ui`, from `common.*` and `dashboard.charts.series.*`. |
| `packages/ui/__tests__/i18n/*` | `apps/web/__tests__/i18n/*` | Rewritten against the factory, the `ui` locales and an isolated instance. |
| `packages/ui/src/controls/*` | `apps/web/src/components/ui/*` (same names) | `floway` identifiers renamed `flowmock`; strings read from the `ui` namespace; comments point at FlowMock paths. |
| `packages/ui/src/controls/{yaml-editor.tsx,yaml.worker.ts}` | `apps/web/src/components/upstream-editor/{models-yaml-editor.tsx,models-yaml.worker.ts}` | A generic YAML editor with an optional JSON Schema, an accessible name and the body viewer's type metrics. |
| `packages/ui/src/charts/*` | `apps/web/src/components/charts/*` (same names) | Strings read from `ui.chartSeries`; `time-axis.ts` is `dashboard-time.ts` without the dashboard's API query and with neutral names. |
| `packages/ui/src/lib/hue.ts` | `apps/web/src/lib/hue.ts` | `oklchToHex` only. |
| `patches/@fluentui__react-charts@9.3.22.patch` | `patches/@fluentui__react-charts@9.3.22.patch` | Unchanged. |
| `packages/ui/__tests__/charts/*` | `apps/web/__tests__/components/charts/*` | `time-axis_test.ts` adds frame, key, tick and label cases. |
| `packages/ui/src/gallery/{gallery,layout}.tsx` | `apps/web/src/routes/dashboard-winui-gallery.tsx` | A named `Gallery` export without the colour-picker section, its copy about FlowMock, and the generic control sections of `control-sections.tsx` appended. |
| `packages/ui/src/lib/page-navigation.ts` | `apps/web/src/lib/page-navigation.ts` | History-state mark renamed `flowmockPageChange`. |
| `packages/ui/__tests__/controls/*` | `apps/web/__tests__/components/ui/*` (same names) | Paths only. |

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

## Meslo LG

The four `packages/ui/src/assets/fonts/meslo-lg-s-*.generated.woff2` files are
taken from Floway, which converted them from the non-DZ Meslo LG v1.2.1 archive
at commit `09a431d546d211130352c28eb0466e5d7d5aeaf0`:

https://github.com/andreberg/Meslo-Font/blob/09a431d546d211130352c28eb0466e5d7d5aeaf0/dist/v1.2.1/Meslo%20LG%20v1.2.1.zip

They are the Meslo LG S Regular, Italic, Bold and Bold Italic TrueType faces,
converted to WOFF2 with every fixed-width glyph centred in a 1264-unit advance.
No outline, hinting instruction, character map or proportional-glyph advance is
otherwise changed.

Meslo LG is a customized version of Apple's Menlo, itself a customized
Bitstream Vera Sans Mono:

```
Copyright 2009, 2010, 2013 André Berg
Copyright © 2009 Apple Inc.
Copyright © 2006 by Tavmjong Bah.
Copyright © 2003 by Bitstream, Inc. All Rights Reserved.
```

Menlo is a trademark of Apple Inc. Bitstream Vera is a trademark of Bitstream,
Inc., designed by Jim Lyles. Meslo LG is licensed under the Apache License,
Version 2.0; the full text is in
`packages/ui/src/assets/fonts/LICENSE-Meslo-LG.txt`.
