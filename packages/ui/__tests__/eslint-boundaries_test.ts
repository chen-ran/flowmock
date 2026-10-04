// @vitest-environment node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const probes = {
  control: 'packages/ui/src/controls/example.tsx',
  page: 'apps/web/src/routes/example.tsx',
  fluent: 'packages/ui/src/fluent.ts',
  winui: 'packages/ui/src/winui/theme.ts',
  toaster: 'packages/ui/src/winui/toaster.tsx',
  translation: 'packages/ui/src/i18n/translation.tsx',
  i18nInit: 'packages/ui/src/i18n/init.ts',
};

// The repository's typed parser only accepts files a tsconfig already lists. A
// probe that exists on disk is parsed by its own project with the text below; one
// that does not exist yet is invisible to that project and goes to the project
// service's default project instead. The rules under test read only import
// syntax.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: {
    languageOptions: {
      parserOptions: {
        project: null,
        tsconfigRootDir: root,
        projectService: {
          allowDefaultProject: Object.values(probes).filter(path => !existsSync(`${root}${path}`)),
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

// The first lint builds the typed program for the whole package, which takes
// seconds; it is paid here rather than out of the first test's budget.
beforeAll(async () => {
  await lint(probes.control, fluentType);
}, 60_000);

describe('Fluent value-import boundary', () => {
  it('rejects a value import outside fluent.ts', async () => {
    expect(await lint(probes.control, fluentValue)).toContain('no-restricted-imports');
    expect(await lint(probes.page, fluentValue)).toContain('no-restricted-imports');
  });

  it('allows type-only imports', async () => {
    expect(await lint(probes.control, fluentType)).not.toContain('no-restricted-imports');
    expect(await lint(probes.page, fluentType)).not.toContain('no-restricted-imports');
  });

  it('allows the value import in fluent.ts and the WinUI layer it wraps', async () => {
    expect(await lint(probes.fluent, fluentNamespace)).not.toContain('no-restricted-imports');
    expect(await lint(probes.winui, fluentValue)).not.toContain('no-restricted-imports');
  });
});

describe('Toast state boundary', () => {
  it('admits @fluentui/react-toast only in the WinUI toaster', async () => {
    expect(await lint(probes.toaster, toastValue)).not.toContain('no-restricted-imports');
    expect(await lint(probes.winui, toastValue)).toContain('no-restricted-imports');
    expect(await lint(probes.control, toastValue)).toContain('no-restricted-imports');
  });
});

describe('Translation boundary', () => {
  it('admits react-i18next only in the typed boundary and its initializer', async () => {
    expect(await lint(probes.translation, i18nValue)).not.toContain('no-restricted-imports');
    expect(await lint(probes.i18nInit, "import { initReactI18next } from 'react-i18next';\nexport const x = initReactI18next;\n")).not.toContain('no-restricted-imports');
    expect(await lint(probes.control, i18nValue)).toContain('no-restricted-imports');
    expect(await lint(probes.page, i18nValue)).toContain('no-restricted-imports');
  });
});
