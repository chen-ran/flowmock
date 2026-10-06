import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The prerendered index.html is the first thing a visitor's browser paints, and
// three facts about it are invisible to every unit test: the document names its
// language, the inlined critical block precedes the linked WinUI stylesheet
// (whose rules reach the same Fluent class names at the same specificity, so
// the later sheet has to be the layer's), and the boot screen renders inside
// the FluentProvider that hydration takes over.
const html = await readFile(resolve(import.meta.dirname, '../dist/client/index.html'), 'utf8');

const failures: string[] = [];
if (!html.includes('<html lang="en"')) failures.push('the document does not declare lang="en"');

const critical = html.indexOf('<style>');
const winui = html.search(/<link href="\/assets\/[^"]*flowmock-winui[^"]*\.css" rel="stylesheet"/);
if (critical === -1) failures.push('no inlined critical <style> block');
else if (!html.slice(critical, html.indexOf('</style>', critical)).includes('--fontFamilyBase')) failures.push('the inlined <style> is not the critical block');
if (winui === -1) failures.push('no linked WinUI stylesheet');
if (critical !== -1 && winui !== -1 && winui < critical) failures.push('the WinUI stylesheet is linked before the critical block');

const body = html.slice(html.indexOf('<body'));
const provider = body.indexOf('fui-FluentProvider');
const boot = body.indexOf('flowmock-loading');
if (provider === -1) failures.push('the body renders no FluentProvider');
if (boot === -1) failures.push('the body renders no boot screen');
if (provider !== -1 && boot !== -1 && boot < provider) failures.push('the boot screen renders outside the FluentProvider');

if (failures.length > 0) throw new Error(`dist/client/index.html:\n- ${failures.join('\n- ')}`);
