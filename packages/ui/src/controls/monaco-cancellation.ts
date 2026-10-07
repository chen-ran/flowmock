// Disposing an editor cancels its word highlighter's pending Delayer, and the
// Delayer rejects a promise the highlighter never awaited. So an editor torn
// down within 50ms of a cursor or content change -- every StrictMode remount
// in development, or a view switched right after typing -- reports an
// unhandled `Canceled`. Monaco's cancellation errors carry that name and that
// message, which is how Monaco itself recognizes them; those are dropped here,
// and any other rejection is left to be reported.
// https://github.com/microsoft/vscode/blob/484fdf69b8509c1c9370d913b32e9f6d3a68cc99/src/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.ts#L275-L284
// https://github.com/microsoft/vscode/blob/484fdf69b8509c1c9370d913b32e9f6d3a68cc99/src/vs/base/common/async.ts#L423-L427
// https://github.com/microsoft/vscode/blob/484fdf69b8509c1c9370d913b32e9f6d3a68cc99/src/vs/base/common/errors.ts#L195-L205
const CANCELED = 'Canceled';

const isMonacoCancellation = (reason: unknown): boolean =>
  reason instanceof Error && reason.name === CANCELED && reason.message === CANCELED;

interface RejectionEvent {
  reason: unknown;
  preventDefault: () => void;
}

export const ignoreMonacoCancellations = (target: { addEventListener: (type: 'unhandledrejection', listener: (event: RejectionEvent) => void) => void }): void => {
  target.addEventListener('unhandledrejection', event => {
    if (isMonacoCancellation(event.reason)) event.preventDefault();
  });
};
