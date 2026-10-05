// Ported from Floway apps/web/src/lib/hue.ts (MIT). See NOTICE.md.
import { converter, formatHex, modeOklch, modeRgb, useMode as registerMode } from 'culori/fn';

registerMode(modeRgb);
registerMode(modeOklch);
const toRgb = converter('rgb');

export const oklchToHex = (lightness: number, chroma: number, hue: number): string =>
  formatHex(toRgb({ mode: 'oklch', l: lightness, c: chroma, h: hue }));
