import { DARK_SCHEME_QUERY, useMediaQuery } from './lib/use-media-query.ts';
import { winuiDarkTheme, winuiLightTheme } from './winui/theme.ts';

export { DARK_SCHEME_QUERY, useMediaQuery, winuiDarkTheme, winuiLightTheme };

// The app follows the system scheme and offers no override, so the one query
// that switches the --winui-* dictionaries in ./winui/tokens.ts also picks the
// Fluent theme mounted above them.
export const useSystemTheme = () => useMediaQuery(DARK_SCHEME_QUERY) ? winuiDarkTheme : winuiLightTheme;
