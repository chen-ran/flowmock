// Ported from Floway apps/web/__tests__/winui/motion_test.tsx (MIT). See NOTICE.md.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { fluentComponents } from '../../src/fluent.ts';
import { stubMatchMedia } from '../match-media-stub.ts';
import { renderInApp } from '../render.tsx';

describe('winui presence motion', () => {
  stubMatchMedia(() => false);

  const { Button, Dialog, DialogBody, DialogSurface, DialogTitle } = fluentComponents;

  it('renders the dialog through the motion slot and keeps a caller-supplied motion callback', async () => {
    const onMotionFinish = vi.fn();
    const DialogHarness = () => {
      const [open, setOpen] = useState(true);
      return <Dialog open={open} surfaceMotion={{ onMotionFinish }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete the key</DialogTitle>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </DialogBody>
        </DialogSurface>
      </Dialog>;
    };

    renderInApp(<DialogHarness />);
    await screen.findByRole('dialog', { name: 'Delete the key' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onMotionFinish).toHaveBeenCalled());
  });
});
