// Ported from Floway apps/web/src/components/ui/body-editor.tsx (MIT). See NOTICE.md.
import { MoreHorizontalRegular, SearchRegular } from '@fluentui/react-icons';
import * as monaco from 'monaco-editor';
import './monaco-workers.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { EmptyStateLine } from './empty-state.tsx';
import { PANEL_BAND_CLASS } from './panel.tsx';
import { TooltipIconButton } from './tooltip-icon-button.tsx';
import { copyOutcomeIcon, useCopyLabel, useCopyToClipboard } from './use-copy-to-clipboard.ts';
import { fluentComponents } from '../fluent.ts';
import { monospaceStack } from '../font-stacks.ts';
import { useUiTranslation } from '../i18n/ui-translation.ts';
import { DARK_SCHEME_QUERY, useMediaQuery } from '../lib/use-media-query.ts';

const { Button, Menu, MenuItem, MenuItemCheckbox, MenuList, MenuPopover, MenuTrigger } = fluentComponents;

export default function BodyEditor({ text, json, label, toolbarStart, emptyText }: { text: string; json: boolean; label: string; toolbarStart?: ReactNode; emptyText?: string }) {
  const { t } = useUiTranslation();
  const [wrap, setWrap] = useState(true);
  const { copy, outcomeFor } = useCopyToClipboard();
  const copyLabel = useCopyLabel();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const dark = useMediaQuery(DARK_SCHEME_QUERY);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Reuse the owning monospace tokens; Monaco virtualizes long lines and documents.
    // https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IStandaloneEditorConstructionOptions.html
    const style = getComputedStyle(container);
    const editor = monaco.editor.create(container, {
      automaticLayout: true,
      fontFamily: monospaceStack,
      fontSize: Number.parseFloat(style.getPropertyValue('--flowmock-font-size-mono')),
      padding: { top: Number.parseFloat(style.getPropertyValue('--spacingVerticalS')), bottom: Number.parseFloat(style.getPropertyValue('--spacingVerticalS')) },
      minimap: { enabled: false },
      readOnly: true,
      domReadOnly: true,
      scrollBeyondLastLine: false,
      tabSize: 2,
      folding: true,
      wordWrap: 'on',
      model: monaco.editor.createModel('', 'plaintext'),
    });
    editorRef.current = editor;
    return () => {
      const model = editor.getModel();
      editor.dispose();
      model?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    model.setValue(text);
    monaco.editor.setModelLanguage(model, json ? 'json' : 'plaintext');
    editor.updateOptions({ ariaLabel: label });
    editor.setScrollTop(0);
  }, [text, json, label]);

  useEffect(() => { editorRef.current?.updateOptions({ theme: dark ? 'vs-dark' : 'vs' }); }, [dark]);

  return <div className="h-full min-h-0 flex flex-col">
    <div className={`${PANEL_BAND_CLASS} flex items-center gap-2 min-w-0 shrink-0`}>
      <div className="min-w-0">{toolbarStart}</div>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <TooltipIconButton icon={<SearchRegular />} label={t('ui.bodyViewer.find')} onClick={() => void editorRef.current?.getAction('actions.find')?.run()} />
        <TooltipIconButton icon={copyOutcomeIcon(outcomeFor())} label={copyLabel(outcomeFor(), t('ui.copy.action'))} onClick={() => copy(text)} />
        <Menu checkedValues={{ wrap: wrap ? ['on'] : [] }} onCheckedValueChange={(_, data) => {
          const enabled = data.checkedItems.includes('on');
          setWrap(enabled);
          editorRef.current?.updateOptions({ wordWrap: enabled ? 'on' : 'off' });
        }}>
          <MenuTrigger disableButtonEnhancement><Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('ui.bodyViewer.options')} /></MenuTrigger>
          <MenuPopover><MenuList>
            {json && <MenuItem onClick={() => void editorRef.current?.getAction('editor.foldLevel2')?.run()}>{t('ui.bodyViewer.fold')}</MenuItem>}
            {json && <MenuItem onClick={() => void editorRef.current?.getAction('editor.unfoldAll')?.run()}>{t('ui.bodyViewer.unfold')}</MenuItem>}
            <MenuItemCheckbox name="wrap" value="on">{t('ui.bodyViewer.wrap')}</MenuItemCheckbox>
          </MenuList></MenuPopover>
        </Menu>
      </div>
    </div>
    {!text && emptyText && <EmptyStateLine className="p-4">{emptyText}</EmptyStateLine>}
    <div className="flex-1 min-h-0 min-w-0" ref={containerRef} />
  </div>;
}
