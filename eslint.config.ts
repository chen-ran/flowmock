import stylisticPlugin from '@stylistic/eslint-plugin';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import type { Linter } from 'eslint';
import importPlugin from 'eslint-plugin-import';

// Rule set derived from Floway's eslint.config.ts (MIT), trimmed to the
// packages FlowMock ships today. See NOTICE.md.

const RESTRICTED_IMPORT_PATTERNS = [
  {
    group: ['@flowmock/*/src/**'],
    message: 'Cross-package deep imports are forbidden. Use the package\'s public exports map.',
  },
  {
    group: ['@flowmock/server', '@flowmock/server/*', '!@flowmock/server/app-type'],
    message: 'apps/server is a deployment target, not a library. Only its type-only ./app-type export is public.',
  },
];

const projectList = [
  './packages/protocols/tsconfig.json',
  './packages/core/tsconfig.json',
  './packages/test-fixtures/tsconfig.json',
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
    'no-restricted-imports': ['error', { patterns: RESTRICTED_IMPORT_PATTERNS }],

    // packages/* stay runtime-independent: the engine reaches Node only
    // through the Transport, Clock and CorpusStore contracts.
    'import/no-restricted-paths': ['error', {
      zones: [
        { target: './packages', from: './apps', message: 'Packages must not depend on apps.' },
        { target: './packages/protocols', from: './packages/core', message: 'protocols sits below core.' },
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
    files: ['**/*.ts'],
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
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...RESTRICTED_IMPORT_PATTERNS,
          { group: ['node:*'], message: 'packages/* are runtime-independent; reach Node through apps/server.' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'setTimeout', message: 'Schedule through the Clock contract so fake-clock tests stay deterministic.' },
        { name: 'setInterval', message: 'Schedule through the Clock contract so fake-clock tests stay deterministic.' },
        { name: 'process', message: 'packages/* are runtime-independent.' },
        { name: 'Buffer', message: 'Use Uint8Array; packages/* are runtime-independent.' },
      ],
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
