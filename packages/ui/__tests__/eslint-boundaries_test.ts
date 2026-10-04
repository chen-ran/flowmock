// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));

// The repository's typed parser only accepts files a tsconfig already lists, and
// these probes exist nowhere on disk. The project service with a default
// project parses them instead; the rules under test read only import syntax.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: {
    languageOptions: {
      parserOptions: {
        project: null,
        tsconfigRootDir: root,
        projectService: {
          allowDefaultProject: ['packages/ui/src/*.ts', 'packages/ui/src/*/*.{ts,tsx}', 'apps/web/src/*/*.tsx'],
          defaultProject: 'packages/ui/tsconfig.json',
        },
      },
    },
  },
});

const lint = async (path: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath: `${root}${path}` });
  const fatal = result.messages.find(message => message.fatal);
  if (fatal) throw new Error(fatal.message);
  return result.messages.map(message => message.ruleId);
};

const fluentValue = "import { Button } from '@fluentui/react-components';\nexport const x = Button;\n";
const fluentType = "import type { ButtonProps } from '@fluentui/react-components';\nexport type X = ButtonProps;\n";
const fluentNamespace = "import * as fluentNamespace from '@fluentui/react-components';\nexport const n = fluentNamespace;\n";
const toastValue = "import { useToastController } from '@fluentui/react-toast';\nexport const x = useToastController;\n";
const i18nValue = "import { useTranslation } from 'react-i18next';\nexport const x = useTranslation;\n";

describe('Fluent value-import boundary', () => {
  it('rejects a value import outside fluent.ts', async () => {
    expect(await lint('packages/ui/src/controls/example.tsx', fluentValue)).toContain('no-restricted-imports');
    expect(await lint('apps/web/src/routes/example.tsx', fluentValue)).toContain('no-restricted-imports');
  });

  it('allows type-only imports', async () => {
    expect(await lint('packages/ui/src/controls/example.tsx', fluentType)).not.toContain('no-restricted-imports');
    expect(await lint('apps/web/src/routes/example.tsx', fluentType)).not.toContain('no-restricted-imports');
  });

  it('allows the value import in fluent.ts and the WinUI layer it wraps', async () => {
    expect(await lint('packages/ui/src/fluent.ts', fluentNamespace)).not.toContain('no-restricted-imports');
    expect(await lint('packages/ui/src/winui/theme.ts', fluentValue)).not.toContain('no-restricted-imports');
  });
});

describe('Toast state boundary', () => {
  it('admits @fluentui/react-toast only in the WinUI toaster', async () => {
    expect(await lint('packages/ui/src/winui/toaster.tsx', toastValue)).not.toContain('no-restricted-imports');
    expect(await lint('packages/ui/src/winui/theme.ts', toastValue)).toContain('no-restricted-imports');
    expect(await lint('packages/ui/src/controls/example.tsx', toastValue)).toContain('no-restricted-imports');
  });
});

describe('Translation boundary', () => {
  it('admits react-i18next only in the typed boundary and its initializer', async () => {
    expect(await lint('packages/ui/src/i18n/translation.tsx', i18nValue)).not.toContain('no-restricted-imports');
    expect(await lint('packages/ui/src/i18n/init.ts', "import { initReactI18next } from 'react-i18next';\nexport const x = initReactI18next;\n")).not.toContain('no-restricted-imports');
    expect(await lint('packages/ui/src/controls/example.tsx', i18nValue)).toContain('no-restricted-imports');
    expect(await lint('apps/web/src/routes/example.tsx', i18nValue)).toContain('no-restricted-imports');
  });
});
