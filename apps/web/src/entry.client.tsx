// Ported from Floway apps/web/src/entry.client.tsx (MIT). See NOTICE.md.
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

// A recoverable error is not recoverable here: React answers a hydration
// mismatch by rebuilding the document, silently dropping every node it did not
// create. Rethrowing from its own task makes that uncaught, past every
// boundary. A browser extension editing the HTML before React loads trips it
// too; that is the intended trade.
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError(error) {
        setTimeout(() => {
          throw error;
        });
      },
    },
  );
});
