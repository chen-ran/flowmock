import { shellLoadingLabel } from '../shell.ts';

const en = {
  translation: {
    app: {
      title: 'FlowMock',
      documentTitle: '{{title}} | FlowMock',
    },
    auth: {
      login: {
        title: 'Sign in',
        adminKey: 'Admin key',
        adminKeyPlaceholder: 'The server\'s admin key',
        submit: 'Sign in',
        keyRequired: 'Enter the admin key.',
        invalidKey: 'This is not the server\'s admin key.',
        rateLimited: 'Too many failed attempts. Try again in a minute.',
        unreachable: 'FlowMock did not answer. Check that the server is running.',
        failed: 'Sign-in failed.',
        hint: 'The admin key is the <variable>FLOWMOCK_ADMIN_KEY</variable> the server was started with.',
      },
    },
    nav: {
      label: 'Navigation',
      open: 'Open navigation',
      close: 'Close navigation',
      skip: 'Skip to content',
      overview: 'Overview',
      corpus: 'Recordings',
      cassettes: 'Cassettes',
      scenarios: 'Scenarios',
      keys: 'Keys and targets',
      monitor: 'Live monitor',
      requests: 'Requests',
      settings: 'Settings',
      groups: {
        corpus: 'Corpus',
        replay: 'Replay',
        monitor: 'Monitor',
      },
    },
    logout: {
      label: 'Sign out',
      title: 'Sign out?',
      message: 'This browser forgets its session. Sign in again with the admin key.',
      action: 'Sign out',
    },
    settings: {
      description: 'Preferences for this browser, and how the server is running.',
      sections: {
        preferences: 'Preferences',
        server: 'Server',
      },
      language: {
        label: 'Language',
        description: 'Kept in this browser.',
      },
      appearance: 'Light and dark follow your system appearance.',
      version: 'FlowMock version',
      access: {
        protected: 'Protected by an admin key',
        protectedDescription: 'The admin API answers only a session or the key itself.',
        open: 'Open admin API',
        openDescription: 'The server runs without an admin key, so it listens on loopback only.',
      },
      timeline: {
        persistent: 'Request timeline kept for {{days, count}} days, up to {{entries, count}} requests',
        memory: 'Request timeline kept in memory',
        description: 'Set with FLOWMOCK_TIMELINE_PERSIST, FLOWMOCK_TIMELINE_RETAIN_DAYS and FLOWMOCK_TIMELINE_MAX.',
      },
      signOutDescription: 'End this browser\'s session.',
    },
    common: {
      language: 'Language',
      loading: shellLoadingLabel,
      errors: {
        refresh: 'Refresh',
        back: 'Back',
        title: 'Error',
        unexpectedTitle: 'Something went wrong',
        unexpectedDescription: 'An unexpected error occurred',
        notFound: 'The requested page could not be found',
      },
    },
  },
} as const;

export default en;
