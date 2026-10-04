// Strings the controls in this package render themselves. They live under the
// ui namespace so an app's own catalogue can never shadow one, and the values
// are taken from Floway's English locale (MIT), where the same controls read
// them from its common namespace. See NOTICE.md.
const en = {
  translation: {
    ui: {
      common: {
        on: 'On',
        off: 'Off',
        cancel: 'Cancel',
        dismiss: 'Dismiss',
        noOptions: 'No options',
        noSuggestions: 'No suggestions',
      },
      discard: {
        title: 'Discard unsaved changes?',
        message: 'This form has changes that have not been saved.',
        keep: 'Keep editing',
        discard: 'Discard',
      },
      copy: {
        action: 'Copy',
        copied: 'Copied',
        failed: 'Copy failed',
      },
      bodyViewer: {
        options: 'Body options',
        find: 'Find in body',
        fold: 'Collapse JSON',
        unfold: 'Expand all',
        wrap: 'Wrap lines',
      },
      chartSeries: {
        all: 'Show all series',
        invert: 'Invert series selection',
        none: 'Hide all series',
        toggleHint: 'Click to toggle. Shift-click or double-click to isolate.',
      },
    },
  },
} as const;

export default en;
