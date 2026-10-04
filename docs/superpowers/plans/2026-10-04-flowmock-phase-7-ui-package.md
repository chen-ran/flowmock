# FlowMock 阶段 7：UI 包 `packages/ui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `packages/ui`，按管理平台页面的需要逐步移植 Floway 的 Fluent UI v9 → WinUI 3 重塑层、通用控件、charts、类型化 i18n 边界与构建辅助，并从第一天起用 ESLint 强制“Fluent 值导入只能经过 `packages/ui/src/fluent.ts`”。

**Architecture:** `packages/ui` 是浏览器代码包，不含任何 FlowMock 领域知识（不认识录制、场景、key）。它导出：`./fluent`（唯一的 Fluent 值入口 `fluentComponents`）、`./theme`（亮/暗 WinUI 主题与字体栈）、`./winui`（运动常量、`winuiCss`、关键 CSS）、`./controls/*`（通用控件）、`./charts/*`、`./i18n`（类型化翻译边界工厂与控件自带文案片段）、`./vite`（TypeScript 样式表虚拟模块插件）、`./uno`（UnoCSS 预设）。`apps/web` 只通过这些导出使用 Fluent。

**Tech Stack:** React 19、Fluent UI v9（`@fluentui/react-components`、`@fluentui/react-icons`、`@fluentui/react-toast`、`@fluentui/react-charts`）、i18next + react-i18next、UnoCSS、Vite 8、Vitest 4 + happy-dom + `@testing-library/react`、Monaco（仅 body-editor）。

**移植来源（Floway 仓库，参考修订 `c7e4d782763b010e44ba243588f2c83c90c97335`）：** `apps/web/src/fluent.ts`、`apps/web/src/theme.ts`、`apps/web/src/font-stacks.ts`、`apps/web/src/critical.css.ts`、`apps/web/src/winui/**`（约 44 个文件、2.4k 行 + controls 5.9k 行）、`apps/web/src/components/ui/**`（50 个文件、4.3k 行）、`apps/web/src/components/charts/**`（12 个文件）、`apps/web/src/i18n/{translation.tsx,number-format.ts,languages.ts,language-preference.ts,resources.ts,shell.ts}`、`apps/web/vite.config.ts` 中的 `typescriptStylesheets` 插件、`apps/web/uno.config.ts`、`patches/@fluentui__react-charts@9.3.22.patch`，以及对应的 `apps/web/__tests__/**` 测试。

## Global Constraints

- 遵循 [总览](2026-10-04-flowmock-index.md) 的全部全局约束。
- **按需移植**：每个任务只移植下一阶段页面确实要用的文件；不整体复制目录。每个移植文件头部写明 Floway 原路径，并在 `NOTICE.md` 的移植表中追加一行。
- WinUI 数值保持 Floway 中附带的 `microsoft-ui-xaml` 固定提交引用，不得删除引用或改为凭记忆的数值（Floway `apps/web/AGENTS.md` 的“Ground every visual and motion value in upstream source”同样适用）。
- 所有 `floway` 前缀的标识（CSS 动画名、虚拟模块名、存储键、属性名）改为 `flowmock`。
- 控件中写死的文案全部改为 `packages/ui` 自带的 i18n 片段（`ui.*` 命名空间），en 与 zh-Hans 结构等价。
- 视觉相关的改动必须在真实浏览器里打开验证（开发与生产构建都要看），不能只看源码。
- `packages/ui` 不得依赖 `@flowmock/core`、`@flowmock/server`。

---

### Task 1: 包脚手架与 ESLint 边界

**Files:**
- Create: `packages/ui/package.json`、`packages/ui/tsconfig.json`、`packages/ui/vitest.config.ts`、`packages/ui/__tests__/setup.ts`（移植 Floway `__tests__/setup.ts`、`match-media-stub.ts`、`local-storage-stub.ts`、`render.tsx`、`settle.ts`）
- Modify: `eslint.config.ts`（加入 `packages/ui/tsconfig.json`；React 与 react-hooks 规则作用于 `packages/ui/**` 与 `apps/web/**`；把“运行时无关”规则的范围从 `packages/*/src` 收窄为 `packages/{protocols,core}/src`）
- Modify: `pnpm-workspace.yaml`（如需构建脚本白名单）
- Test: `packages/ui/__tests__/eslint-boundaries_test.ts`

**Interfaces:**
- ESLint 规则（`no-restricted-imports` + `no-restricted-syntax`）：
  - `packages/ui/src/**`（`fluent.ts` 与 `winui/**` 除外）和 `apps/web/src/**`：禁止对 `@fluentui/react-components` 的值导入，只允许 `import type`；提示信息指向 `@flowmock/ui/fluent`。
  - `@fluentui/react-toast` 只允许出现在 `packages/ui/src/winui/toaster.tsx`。
  - `react-i18next` 只允许出现在 `packages/ui/src/i18n/translation.tsx` 与 `packages/ui/src/i18n/init.ts`。

- [ ] **Step 1: 写边界测试**

```ts
// packages/ui/__tests__/eslint-boundaries_test.ts
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const lint = async (filePath: string, code: string) => {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map(message => message.ruleId);
};

describe('Fluent value-import boundary', () => {
  it('rejects a value import outside fluent.ts', async () => {
    expect(await lint(`${root}/packages/ui/src/controls/example.tsx`, "import { Button } from '@fluentui/react-components';\nexport const x = Button;\n"))
      .toContain('no-restricted-imports');
  });

  it('allows type-only imports', async () => {
    expect(await lint(`${root}/packages/ui/src/controls/example.tsx`, "import type { ButtonProps } from '@fluentui/react-components';\nexport type X = ButtonProps;\n"))
      .not.toContain('no-restricted-imports');
  });

  it('allows the value import in fluent.ts', async () => {
    expect(await lint(`${root}/packages/ui/src/fluent.ts`, "import * as fluentNamespace from '@fluentui/react-components';\nexport const n = fluentNamespace;\n"))
      .not.toContain('no-restricted-imports');
  });
});
```

- [ ] **Step 2: 确认 RED**：`pnpm --filter @flowmock/ui exec vitest run __tests__/eslint-boundaries_test.ts`（包不存在或规则不存在而失败）。
- [ ] **Step 3: 创建包与规则**。`package.json` 依赖版本与 Floway `apps/web/package.json` 对齐（React ^19.2、Fluent `react-components` ^9.74、`react-icons` ^2.0.334、`react-toast` ^9.8、`react-charts` 9.3.22 精确版本以匹配补丁、i18next ^26、react-i18next ^17）。`tsconfig.json`：`jsx: react-jsx`、`lib: [ES2024, DOM, DOM.Iterable]`、`types: []`。Vitest：`environment: 'happy-dom'`、`setupFiles: ['__tests__/setup.ts']`。
- [ ] **Step 4: 验证 GREEN 并跑全量**：`pnpm run verify`。
- [ ] **Step 5: 提交**：`git commit -am "chore(ui): scaffold the UI package and its Fluent import boundary"`

---

### Task 2: WinUI 重塑层与唯一 Fluent 入口

**Files:**
- Create（移植）: `packages/ui/src/winui/{wrap.ts,appearance.ts,motion.ts,presence.ts,reposition.ts,switch-drag.tsx,toaster.tsx,tokens.ts,theme.ts,reset.css.ts,focus-rect.css.ts,page-transition.css.ts,progress-indeterminate.css.ts,index.ts}`
- Create（移植）: `packages/ui/src/winui/controls/*.css.ts`（先移植阶段 8 页面会用到的：button、card、dialog、field、list、menu、message-bar、nav、popover、progress、scrollbar、select、switch、table、tabs、text-input、text、toast、toolbar、tooltip、badge-tag、choice；accordion、color-picker、drawer 推迟到真正需要时）
- Create（移植）: `packages/ui/src/fluent.ts`、`packages/ui/src/theme.ts`、`packages/ui/src/font-stacks.ts`、`packages/ui/src/critical.css.ts`
- Test（移植）: `packages/ui/__tests__/winui/{appearance-attribute_test.tsx,field-atoms_test.tsx,folded-derivations_test.ts,motion_test.tsx,toast-queue_test.tsx,token-channel-order_test.ts}` 与 `__tests__/winui/controls/*` 中对应控件的测试

**Interfaces:**
- `@flowmock/ui/fluent`：`export const fluentComponents: FluentComponents`（`withWinuiToaster(withWinuiDrag(withWinuiMotion(withWinuiAppearance(namespace))))`）。
- `@flowmock/ui/theme`：`flowmockLightTheme`、`flowmockDarkTheme`、`useSystemTheme()`。
- `@flowmock/ui/winui`：`winuiCss: string`、`criticalCss: string`、运动常量。

- [ ] **Step 1: 先移植测试**，把 `floway` 字样替换为 `flowmock`，运行确认 RED（模块不存在）。
- [ ] **Step 2: 移植源码**：`winui/index.ts` 只拼接已移植的控件样式；`page-transition.css.ts` 的动画名改为 `flowmock-page-leave`；保留全部 `microsoft-ui-xaml` 引用注释。
- [ ] **Step 3: 验证 GREEN**：`pnpm --filter @flowmock/ui exec vitest run __tests__/winui`。
- [ ] **Step 4: 浏览器验证**：在 Task 3 的开发 playground 中渲染 Button、Dialog、Table、Toast、Switch，亮暗两种主题各截图核对与 Floway 仪表盘一致（同一控件并排对比）。
- [ ] **Step 5: 提交**：`git commit -am "feat(ui): port the WinUI restyling layer and the Fluent entry point"`

---

### Task 3: 构建辅助（样式表虚拟模块与 UnoCSS 预设）

**Files:**
- Create: `packages/ui/src/vite/typescript-stylesheets.ts`（从 Floway `apps/web/vite.config.ts` 抽出 `typescriptStylesheets`，参数化虚拟模块表）
- Create: `packages/ui/src/uno/preset.ts`（从 Floway `apps/web/uno.config.ts` 抽出 theme、shortcuts、rules、blocklist，`dashboard-page` 快捷类保留）
- Create: `packages/ui/playground/`（`index.html`、`main.tsx`、`vite.config.ts`，仅开发用，不在 `files`/exports 中）
- Test（移植）: `packages/ui/__tests__/vite/stylesheet-composition_test.ts`

**Interfaces:**

```ts
// @flowmock/ui/vite
export const typescriptStylesheets: (sheets: Record<`virtual:${string}.css`, { exportName: string; module: string }>) => Plugin;
export const FLOWMOCK_STYLESHEETS: { 'virtual:flowmock-critical.css': {...}; 'virtual:flowmock-winui.css': {...} };
// @flowmock/ui/uno
export const presetFlowmock: () => Preset;
```

- [ ] **Step 1: 移植测试并确认 RED。**
- [ ] **Step 2: 抽取实现**；`?url` 在开发服务器下走 `/@flowmock/stylesheet/` 中间件的逻辑原样保留。
- [ ] **Step 3: playground 构建验证**：`pnpm --filter @flowmock/ui exec vite build playground` 成功，产物中 WinUI 样式表是带哈希的独立 CSS 资源。
- [ ] **Step 4: 验证并提交**：`git commit -am "feat(ui): extract the stylesheet plugin and the UnoCSS preset"`

---

### Task 4: 类型化 i18n 边界工厂

**Files:**
- Create（移植并泛化）: `packages/ui/src/i18n/{translation.tsx,number-format.ts,languages.ts,language-preference.ts,resources.ts,init.ts}`
- Create: `packages/ui/src/i18n/locales/{en.ts,zh-Hans.ts}`（控件自带文案，`ui` 命名空间：`ui.common.cancel`、`ui.copy.action`、`ui.bodyViewer.find` 等，逐个取自被移植控件里的 `t('common.*')` 调用）
- Create: `packages/ui/src/i18n/parity.ts`（`assertLocaleParity(reference, candidate)` 供应用复用）
- Test（移植）: `packages/ui/__tests__/i18n/{languages_test.ts,language_preference_test.ts,resources_test.ts,translation_typecheck.tsx,parity_test.ts}`

**Interfaces:**

```ts
// 应用用自己的英文 locale 类型实例化边界；控件片段由工厂合并进去。
export const createTranslation: <AppLocale extends { translation: object }>() => {
  useTranslation: () => { t: TypedT<Merge<AppLocale, UiLocale>>; i18n: I18n };
  Trans: TypedTrans<Merge<AppLocale, UiLocale>>;
};
export type TranslationKey<Locale> = /* 与 Floway translation.tsx 相同的推导：叶子路径、复数基、插值参数类型 */;
export const initI18n: (options: { loadLocale: (language: SupportedLanguage) => Promise<object>; shell: object }) => Promise<I18n>;
```

- [ ] **Step 1: 移植 `translation_typecheck.tsx`**，改为用一个测试用 locale 实例化工厂，断言错误的键与缺少的插值参数产生类型错误（`// @ts-expect-error`），确认 RED。
- [ ] **Step 2: 泛化实现**：把 Floway 中 `typeof import('./locales/en').default['translation']` 的硬编码换成泛型参数；`alwaysFormat` 与数字格式表原样保留。
- [ ] **Step 3: 平价测试**：`assertLocaleParity` 检查两个 locale 键集合、复数形式与插值占位符完全一致。
- [ ] **Step 4: 验证并提交**：`git commit -am "feat(ui): add the typed translation boundary factory"`

---

### Task 5: 通用控件（按批次，随阶段 8 页面推进）

每一批是一个独立任务，步骤相同：先移植该批在 Floway `__tests__/components/ui/` 中已有的测试并确认 RED → 移植源码（文案改为 `ui.*` 键，`floway` 字样改名）→ 在 playground 渲染并在浏览器中核对 → `pnpm run verify` → 提交。

| 批次 | 控件（`packages/ui/src/controls/`） | 已有测试 | 服务的页面 |
|---|---|---|---|
| 5a 外壳 | `layout.ts`、`dashboard-page-header.tsx`、`panel.tsx`、`section-header.tsx`、`settings-card.tsx`、`empty-state.tsx`、`loading-screen.tsx`(+`.css.ts`)、`error-shell.tsx`(+`.css.ts`)、`scroll-area.tsx`、`route-link.tsx`、`route-menu-item.tsx`、`back-navigation-button.tsx` | `settings-card_test.tsx`、`loading-screen-styles_test.ts`、`route-address_test.tsx` | 全部页面骨架、登录、设置 |
| 5b 数据展示 | `resource-list.tsx`、`table-columns.tsx`、`table-actions.tsx`、`status-badge.tsx`、`http-badge.tsx`、`chip.tsx`、`badge-hue.ts`、`row-title.tsx`、`truncation-tooltip.tsx`、`info-label.tsx`、`tooltip-icon-button.tsx`、`code-block.tsx`、`prism.ts`、`copy-to-clipboard.ts`、`use-copy-to-clipboard.ts`、`outcome-message-bar.tsx`、`outcome-toast.tsx`、`use-poll-while-visible.ts`、`use-refresh.ts` | `truncation-tooltip_test.tsx`、`copy-outcome-expiry_test.ts`、`poll-while-visible_test.ts`、`refresh-supersession_test.tsx`、`inline-emphasis_test.tsx` | 语料、cassette、时间线、key/目标列表 |
| 5c 表单与对话框 | `confirm-dialog.tsx`、`dialog-shell.tsx`、`fluent-form-controls.tsx`、`choice-group.tsx`、`switch-setting.tsx`、`secret-input.tsx`、`multiselect-combobox.tsx`、`use-dialog-invocation.ts`、`use-discard-guard.tsx` | `multiselect-combobox_test.tsx` | 场景表单、key 与目标编辑、设置 |
| 5d 编辑器 | `body-editor.tsx`、`monaco-workers.ts`（Monaco 必须懒加载，接口允许传入 JSON Schema 与 YAML 语言） | 新增 `body-editor-lazy_test.tsx`（断言首屏不导入 `monaco-editor`） | 录制详情、场景 YAML 编辑器 |

`reorder-list`、`markdown`、`masked-icon`、`progress-ring`、`open-link-label` 不移植，除非阶段 8 某页明确需要。

---

### Task 6: Charts

**Files:**
- Create（移植）: `packages/ui/src/charts/{host.tsx,layout.ts,palette.ts,frame-styles.ts,series-legends.ts,series-marker.tsx,series-plot.ts,series-selection.ts,use-element-size.ts,callout-table.tsx,section.tsx,time-axis.ts}`（`dashboard-time.ts` 改名 `time-axis.ts`，去掉仪表盘专有的“按本地日分桶”逻辑之外的领域假设）
- Create: `patches/@fluentui__react-charts@9.3.22.patch`（从 Floway 复制）并在 `pnpm-workspace.yaml` 的 `patchedDependencies` 登记，附 Floway 原注释说明四处修复
- Test（移植）: `packages/ui/__tests__/charts/{palette_test.ts,series-selection_test.ts,time-axis_test.ts}`

- [ ] **Step 1: 移植测试并确认 RED。**
- [ ] **Step 2: 移植源码与补丁**；`pnpm install` 后确认补丁生效（`pnpm patch-commit` 不需要，直接引用补丁文件）。
- [ ] **Step 3: playground 渲染一张两条序列的折线图与一张面积图，浏览器中确认首帧宽度不为 0、序列铺满画布（补丁修复的两个问题）。**
- [ ] **Step 4: 验证并提交**：`git commit -am "feat(ui): port the chart host, palette and series helpers"`

---

### Task 7: 控件画廊（仅开发）

**Files:**
- Create: `packages/ui/src/gallery/gallery.tsx`（导出 `Gallery` 组件，渲染已移植的全部控件与亮暗主题切换）
- Modify: `packages/ui/package.json`（`./gallery` 导出）

`apps/web` 在开发模式下以 `winui-gallery` 路由引用它（与 Floway `routes.ts` 的 `MODE === 'development'` 门控方式相同），生产构建不包含。

- [ ] **Step 1: 写测试**：`render(<Gallery />)` 不抛错且包含每个已移植控件的 `data-gallery-item`。
- [ ] **Step 2: 实现并在浏览器中核对，提交**：`git commit -am "feat(ui): add a development-only control gallery"`

---

## 阶段验收

- [ ] `pnpm run verify` 通过（含 `packages/ui` 的 lint、typecheck 与测试）。
- [ ] playground 生产构建成功；在浏览器中亮暗主题下核对 Task 2、5、6 涉及的全部控件。
- [ ] `NOTICE.md` 移植表覆盖本阶段移植的每个文件。
- [ ] ESLint 边界测试通过：任何 `apps/web` 或 `packages/ui/src/controls` 中的 Fluent 值导入都会失败。
