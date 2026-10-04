// `*` matches any run of characters, `?` one character; everything else is
// literal. Matching is case-insensitive because model names are.
export const globToRegExp = (glob: string): RegExp =>
  new RegExp(`^${glob.split('').map(char => (char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 'i');

export const globMatches = (glob: string, value: string | null | undefined): boolean =>
  value != null && globToRegExp(glob).test(value);

export const anyGlobMatches = (globs: readonly string[], value: string | null | undefined): boolean =>
  globs.some(glob => globMatches(glob, value));
