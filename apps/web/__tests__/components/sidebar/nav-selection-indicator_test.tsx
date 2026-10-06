// Ported from Floway apps/web/__tests__/winui/motion_test.tsx (MIT). See NOTICE.md.
import { fireEvent, screen } from '@testing-library/react';
import { StrictMode, useCallback, useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { NavSelectionIndicator } from '../../../src/components/sidebar/nav-selection-indicator.tsx';
import { stubMatchMedia } from '../../match-media-stub.ts';
import { renderInApp } from '../../render.tsx';

interface ScheduledAnimation {
  cancelled: boolean;
  cancel: () => void;
  addEventListener: () => void;
}

const ROW_HEIGHT = 36;
const ITEMS = ['home', 'keys', 'models'];
const OTHER_LIST_ITEMS = ['settings', 'sign out'];

let scheduled: ScheduledAnimation[] = [];

const stubAnimations = () => {
  scheduled = [];
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => {
      const animation: ScheduledAnimation = {
        addEventListener: () => {},
        cancel: () => { animation.cancelled = true; },
        cancelled: false,
      };
      scheduled.push(animation);
      return animation;
    },
    writable: true,
  });
};

// happy-dom lays nothing out, so every box measures zero and the indicator
// would read every selection change as a zero-length move it can skip.
const stubLayout = () => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement): DOMRect {
      const item = this.dataset.navValue;
      const top = item === undefined ? 0 : ITEMS.indexOf(item) * ROW_HEIGHT;
      const height = item === undefined ? ROW_HEIGHT * ITEMS.length : ROW_HEIGHT;
      return { bottom: top + height, height, left: 0, right: 200, toJSON: () => ({}), top, width: 200, x: 0, y: top } as DOMRect;
    },
    writable: true,
  });
};

// The selection is driven from inside the tree because the indicator measures
// against a container it is rendered into, and re-rendering from the outside
// would remount that container along with the positions it has recorded.
const NavHarness = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState(ITEMS[0]);
  // The container is this component's own element, so its ref is still empty
  // while a child mounted in the same commit runs its layout effect. A callback
  // ref answers during the commit that attaches the node, so the indicator
  // mounts into a container it can already measure.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainer(node);
  }, []);
  return <div ref={attachContainer}>
    <div>
      {[...ITEMS, ...OTHER_LIST_ITEMS].map(item => <button
        aria-current={item === selectedValue ? 'page' : undefined}
        data-nav-value={ITEMS.includes(item) ? item : undefined}
        key={item}
        onClick={() => setSelectedValue(item)}
      >{item}</button>)}
    </div>
    {container !== null && <NavSelectionIndicator containerRef={containerRef} inset={4} otherListIs="below" selectedValue={selectedValue} />}
  </div>;
};

const select = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('nav selection indicator', () => {
  const setMedia = stubMatchMedia(() => false);

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect');
  });

  it('schedules no animation at all when reduced motion is preferred', () => {
    stubLayout();

    stubAnimations();
    const moving = renderInApp(<StrictMode><NavHarness /></StrictMode>);
    select('models');
    expect(scheduled.length).toBeGreaterThan(0);
    moving.unmount();

    stubAnimations();
    setMedia(() => true);
    renderInApp(<StrictMode><NavHarness /></StrictMode>);
    select('models');
    expect(scheduled).toHaveLength(0);
  });

  it('cancels the outgoing animation it already scheduled instead of stacking a second one', () => {
    stubLayout();
    stubAnimations();

    renderInApp(<StrictMode><NavHarness /></StrictMode>);
    select('settings');
    select('sign out');

    expect(scheduled.filter(animation => !animation.cancelled)).toHaveLength(1);
  });
});
