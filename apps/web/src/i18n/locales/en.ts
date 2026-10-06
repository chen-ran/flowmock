import { shellLoadingLabel } from '../shell.ts';

const en = {
  translation: {
    app: {
      title: 'FlowMock',
      documentTitle: '{{title}} | FlowMock',
    },
    common: {
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
