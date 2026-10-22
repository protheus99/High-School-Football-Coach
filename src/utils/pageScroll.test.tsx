import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToTopNow, useScrollTopOnScreenChange } from './pageScroll';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Back to the top for a new screen', () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    root.remove();
  });

  it('freezes scrolling for a moment, then gives it back', () => {
    scrollToTopNow();
    expect(root.style.overflowY).toBe('hidden');
    vi.advanceTimersByTime(200);
    expect(root.style.overflowY).toBe('');
  });

  it('two new screens in a row never leave scrolling frozen', () => {
    scrollToTopNow();
    vi.advanceTimersByTime(5);
    scrollToTopNow(); // inside the first freeze
    vi.advanceTimersByTime(200);
    expect(root.style.overflowY).toBe('');
  });

  it("the season's end (the banquet, then the honors page over it) leaves the app scrollable", () => {
    // App's wrap-up: the banquet flag changes the screen, and an effect then opens the honors page (a second change)
    let openBanquet = () => {};
    const WrapUp = () => {
      const [banquet, setBanquet] = useState(false);
      const [honors, setHonors] = useState(false);
      openBanquet = () => setBanquet(true);
      useScrollTopOnScreenChange([banquet, honors].join('|'));
      useEffect(() => {
        if (banquet) setHonors(true);
      }, [banquet]);
      return <div>{honors ? 'All-State Honors' : banquet ? 'Banquet' : 'Hub'}</div>;
    };
    const app = createRoot(root);
    act(() => app.render(<WrapUp />));
    act(() => openBanquet());
    expect(root.textContent).toBe('All-State Honors');
    vi.advanceTimersByTime(200);
    expect(root.style.overflowY).toBe('');
    act(() => app.unmount());
  });
});
