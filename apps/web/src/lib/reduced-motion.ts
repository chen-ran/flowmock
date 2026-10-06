// Ported from Floway apps/web/src/lib/reduced-motion.ts (MIT). See NOTICE.md.
export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
