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
