import stylisticPlugin from '@stylistic/eslint-plugin';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import type { Linter } from 'eslint';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

// Rule set derived from Floway's eslint.config.ts (MIT), trimmed to the
// packages FlowMock ships today. See NOTICE.md.

type RestrictedImportPath = { name: string; message: string; allowTypeImports?: boolean; allowImportNames?: string[] };
type RestrictedImportPattern = { group: string[]; message: string };

const RESTRICTED_IMPORT_PATTERNS: RestrictedImportPattern[] = [
  {
    group: ['@flowmock/*/src/**'],
    message: 'Cross-package deep imports are forbidden. Use the package\'s public exports map.',
  },
  {
    group: ['@flowmock/server/*', '!@flowmock/server/app-type'],
    message: 'apps/server is a deployment target, not a library. Only its type-only ./app-type export is public.',
  },
];

const RESTRICTED_IMPORT_PATHS: RestrictedImportPath[] = [
  { name: '@flowmock/server', message: 'apps/server exposes only its type-only ./app-type export.' },
  { name: '@flowmock/server/app-type', allowTypeImports: true, message: 'The server app-type entry is type-only.' },
];

const restrictImports = (paths: RestrictedImportPath[], patterns: RestrictedImportPattern[] = []): Linter.RuleEntry => ['error', {
  paths: [...RESTRICTED_IMPORT_PATHS, ...paths],
  patterns: [...RESTRICTED_IMPORT_PATTERNS, ...patterns],
}];

const NODE_BUILTINS: RestrictedImportPattern = {
  group: ['node:*'],
  message: 'packages/* are runtime-independent; reach Node through apps/server.',
};

// Browser code reaches three libraries only through the wrapper that gives them
// their FlowMock shape. Redefining no-restricted-imports replaces its whole
// option value, so every scope below restates the bans it keeps.
const FLUENT_VALUES: RestrictedImportPath = {
  name: '@fluentui/react-components',
  allowTypeImports: true,
  message: 'Take Fluent components from `fluentComponents` in @flowmock/ui/fluent so the WinUI restyling reaches every instance. Type-only imports are fine.',
};
const FLUENT_TOAST: RestrictedImportPath = {
  name: '@fluentui/react-toast',
  message: 'Only packages/ui/src/winui/toaster.tsx rebuilds the toaster from @fluentui/react-toast; use the Toaster from @flowmock/ui/fluent.',
};
const REACT_I18NEXT: RestrictedImportPath = {
  name: 'react-i18next',
  message: 'Reach react-i18next through the typed translation boundary in @flowmock/ui/i18n so locale keys and interpolation values stay type-checked.',
};

const projectList = [
  './packages/protocols/tsconfig.json',
  './packages/core/tsconfig.json',
  './packages/test-fixtures/tsconfig.json',
  './packages/ui/tsconfig.json',
  './apps/server/tsconfig.json',
];

const commonConfig: Linter.Config = {
  plugins: {
    import: importPlugin,
    '@typescript-eslint': tsPlugin as never,
    stylistic: stylisticPlugin,
  },
  rules: {
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', ['internal', 'parent', 'sibling', 'index']],
        'newlines-between': 'always',
        distinctGroup: false,
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-duplicates': 'error',
    'no-restricted-imports': ['error', { paths: RESTRICTED_IMPORT_PATHS, patterns: RESTRICTED_IMPORT_PATTERNS }],

    // packages/* stay runtime-independent: the engine reaches Node only
    // through the Transport, Clock and CorpusStore contracts.
    'import/no-restricted-paths': ['error', {
      zones: [
        { target: './packages', from: './apps', message: 'Packages must not depend on apps.' },
        { target: './packages/protocols', from: './packages/core', message: 'protocols sits below core.' },
        { target: './packages/ui', from: './packages/core', message: 'packages/ui knows nothing about recordings, scenarios or keys.' },
        { target: './packages/ui', from: './packages/protocols', message: 'packages/ui knows nothing about recordings, scenarios or keys.' },
      ],
    }],

    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    }],
    'prefer-const': 'error',
    'no-var': 'error',
    'no-debugger': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],

    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/return-await': ['error', 'always'],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': ['error'],
    '@typescript-eslint/prefer-as-const': 'error',
    '@typescript-eslint/prefer-for-of': 'error',
    '@typescript-eslint/prefer-includes': 'error',
    '@typescript-eslint/prefer-string-starts-ends-with': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],

    'stylistic/indent': ['error', 2, { SwitchCase: 0, offsetTernaryExpressions: true }],
    'stylistic/linebreak-style': ['error', 'unix'],
    'stylistic/semi': ['error', 'always'],
    'stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'avoidEscape' }],
    'stylistic/comma-dangle': ['error', 'always-multiline'],
    'stylistic/arrow-parens': ['error', 'as-needed'],
    'stylistic/object-curly-spacing': ['error', 'always'],
    'stylistic/array-bracket-spacing': ['error', 'never'],
    'stylistic/space-before-function-paren': ['error', { anonymous: 'always', named: 'never', asyncArrow: 'always' }],
    'stylistic/space-in-parens': ['error', 'never'],
    'stylistic/comma-spacing': ['error', { before: false, after: true }],
    'stylistic/key-spacing': ['error', { beforeColon: false, afterColon: true }],
    'stylistic/keyword-spacing': ['error'],
    'stylistic/space-before-blocks': ['error', 'always'],
    'stylistic/space-infix-ops': ['error'],
    'stylistic/no-trailing-spaces': ['error'],
    'stylistic/eol-last': ['error', 'always'],
    'stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
    'stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
    'stylistic/object-curly-newline': ['error', {
      ObjectExpression: { multiline: true, consistent: true },
      ObjectPattern: { multiline: true, consistent: true },
      ImportDeclaration: { multiline: true, consistent: true },
      ExportDeclaration: { multiline: true, consistent: true },
    }],
    'stylistic/array-bracket-newline': ['error', 'consistent'],
    'stylistic/function-paren-newline': ['error', 'consistent'],
    'stylistic/member-delimiter-style': ['error', {
      multiline: { delimiter: 'semi', requireLast: true },
      singleline: { delimiter: 'semi', requireLast: false },
    }],
    'stylistic/type-annotation-spacing': ['error'],
  },
  settings: {
    'import/internal-regex': '^@flowmock/',
    'import/resolver': {
      typescript: { project: projectList, noWarnOnMultipleProjects: true },
    },
  },
};

const config: Linter.Config[] = [
  {
    ...commonConfig,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: projectList,
        noWarnOnMultipleProjects: true,
      },
    },
  },
  {
    // The engine must run anywhere a Transport and Clock can be supplied, so
    // its production sources never reach for Node built-ins or timers.
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/ui/**'],
    rules: {
      'no-restricted-imports': restrictImports([], [NODE_BUILTINS]),
      'no-restricted-globals': ['error',
        { name: 'setTimeout', message: 'Schedule through the Clock contract so fake-clock tests stay deterministic.' },
        { name: 'setInterval', message: 'Schedule through the Clock contract so fake-clock tests stay deterministic.' },
        { name: 'process', message: 'packages/* are runtime-independent.' },
        { name: 'Buffer', message: 'Use Uint8Array; packages/* are runtime-independent.' },
      ],
    },
  },
  {
    // Custom hooks live in plain .ts files, so scoping the React rules to .tsx
    // would leave rules-of-hooks unenforced exactly where it matters most.
    files: ['packages/ui/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      'react/jsx-key': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/no-danger-with-children': 'error',
      // The compiler handles JSX; importing React to use it is not required.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-restricted-imports': restrictImports([FLUENT_VALUES, FLUENT_TOAST, REACT_I18NEXT]),
      'no-restricted-syntax': ['error', {
        // Griffel injects its sheet after the utility sheet, and Text's root
        // states white-space, overflow and text-overflow while Link's states the
        // latter two as inherit, all at one class of specificity, so the utility
        // silently loses.
        selector: 'JSXOpeningElement[name.name=/^(Text|Link)$/] > JSXAttribute[name.name="className"] Literal[value=/(^|\\s)(truncate|text-ellipsis|overflow-hidden|whitespace-(no)?wrap)(\\s|$)/]',
        message: 'This utility is dead on Text and Link: their Griffel roots already state white-space, overflow and text-overflow. Use the component\'s own props — `block truncate wrap={false}` trims — or put the box on the plain element around it.',
      }, {
        // XAML draws a focus visual for every focusable element, so an element
        // made focusable carries the WinUI rect rather than the user agent's
        // outline. Rows are exempt because the table and list stylesheets ring
        // them through Fluent's own focus-visible stamp.
        selector: 'JSXOpeningElement:not([name.name=/^(TableRow|ListItem)$/]):has(JSXAttribute[name.name="tabIndex"] > JSXExpressionContainer > Literal[value=0]):not(:has(JSXAttribute[name.name="className"] :matches(Literal[value=/winui-focus-rect/], TemplateElement[value.raw=/winui-focus-rect/])))',
        message: 'An element made focusable needs the WinUI focus rect: add `winui-focus-rect` to its className, or `winui-focus-rect-within` to a host whose focusable element is not rendered here.',
      }, {
        // A Fluent Card that takes any of these props becomes interactive, and an
        // interactive Card flattens every descendant Text to its own foreground
        // through a two-class selector no utility can outrank.
        // https://github.com/microsoft/fluentui/blob/6dee27b023a2d989f032b4adacb2135d336a67fb/packages/react-components/react-card/library/src/components/Card/useCardStyles.styles.ts
        selector: 'JSXOpeningElement[name.name="Card"] > JSXAttribute[name.name=/^(focusMode|selected|onSelectionChange|onClick|onDoubleClick|onMouseUp|onMouseDown|onPointerUp|onPointerDown|onTouchStart|onTouchEnd|onDragStart|onDragEnd)$/]',
        message: 'This prop makes the Card interactive, and an interactive Card repaints every descendant Text to its own foreground — a secondary line stops reading as secondary, and no className can win it back. Build a clickable surface as a button (see SettingsCard) instead.',
      }, {
        // truncate contributes text-overflow: ellipsis and nothing else.
        selector: 'JSXOpeningElement[name.name="Text"]:has(JSXAttribute[name.name="truncate"]):not(:has(JSXAttribute[name.name="wrap"]))',
        message: 'Fluent\'s `truncate` only adds the ellipsis. The single line and the clip come from `wrap={false}`, and the clip needs a block display, so a Text that trims states all three.',
      }],
    },
  },
  {
    // Browser sources: no Node built-ins or Node globals. Timers are the
    // browser's own, so unlike the engine they stay available. The Vite and
    // UnoCSS helpers run in the app's build, in Node.
    files: ['packages/ui/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
    ignores: ['packages/ui/src/vite/**', 'packages/ui/src/uno/**'],
    rules: {
      'no-restricted-imports': restrictImports([FLUENT_VALUES, FLUENT_TOAST, REACT_I18NEXT], [NODE_BUILTINS]),
      'no-restricted-globals': ['error',
        { name: 'process', message: 'Browser code has no process.' },
        { name: 'Buffer', message: 'Use Uint8Array; browser code has no Buffer.' },
      ],
    },
  },
  {
    // The one value import of Fluent, and the WinUI layer it wraps.
    files: ['packages/ui/src/fluent.ts', 'packages/ui/src/winui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictImports([FLUENT_TOAST, REACT_I18NEXT], [NODE_BUILTINS]),
    },
  },
  {
    // react-components re-exports only the toast's component layer, so the
    // state and hook layers the toaster is rebuilt from come from react-toast.
    files: ['packages/ui/src/winui/toaster.tsx'],
    rules: {
      'no-restricted-imports': restrictImports([REACT_I18NEXT], [NODE_BUILTINS]),
    },
  },
  {
    files: ['packages/ui/src/i18n/translation.tsx'],
    rules: {
      'no-restricted-imports': restrictImports([FLUENT_VALUES, FLUENT_TOAST, {
        name: 'react-i18next',
        allowImportNames: ['Trans', 'useTranslation'],
        message: 'The typed translation boundary owns only Trans and useTranslation.',
      }], [NODE_BUILTINS]),
    },
  },
  {
    files: ['packages/ui/src/i18n/init.ts'],
    rules: {
      'no-restricted-imports': restrictImports([FLUENT_VALUES, FLUENT_TOAST, {
        name: 'react-i18next',
        allowImportNames: ['initReactI18next'],
        message: 'i18n initialization owns only the React plugin; hooks and components belong to translation.tsx.',
      }], [NODE_BUILTINS]),
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/.claude/**',
      '**/dist/**',
      '**/coverage/**',
      '**/data/**',
      'eslint.config.ts',
      'vitest.config.ts',
    ],
  },
];

export default config;
