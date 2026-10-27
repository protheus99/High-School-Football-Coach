import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The account's ducats, set by each test
let balance: number | null = null;
vi.mock('../services/ducats', () => ({ useDucats: () => ({ balance, checkout: null }) }));

const { CoachPointsBadge, DucatChip } = await import('./CurrencyFloats');

const floats = () => [...document.querySelectorAll('.currency-float')].map((f) => ({ text: f.textContent, cls: f.className }));

describe('Spending, made visible', () => {
  let host: HTMLElement;
  let root: Root;
  let clock = Date.now();
  beforeEach(() => {
    // A minute between tests: one test's tap is long gone by the next
    clock += 60_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  const badge = (coachPoints: number, resetKey = 'career-1') =>
    act(() => root.render(<CoachPointsBadge coachPoints={coachPoints} resetKey={resetKey} style={{}} labelStyle={{}} />));
  const tap = (el: Element) => act(() => void el.dispatchEvent(new Event('pointerdown', { bubbles: true })));

  it('a Coach Points spend floats a red number from the tapped button and squeezes the badge', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    badge(650);
    expect(floats()).toEqual([]);
    tap(button);
    badge(630);
    expect(floats()).toEqual([{ text: '−₡20', cls: 'currency-float currency-float-spend' }]);
    expect(host.querySelector('span')!.classList.contains('currency-hit')).toBe(true);
    button.remove();
  });

  it('a spend with no tap starts from the badge; a big one floats bigger', () => {
    badge(3000);
    badge(1000);
    expect(floats()).toEqual([{ text: '−₡2,000', cls: 'currency-float currency-float-spend currency-float-big currency-float-badge' }]);
  });

  it('a gain floats green from the badge', () => {
    badge(500);
    badge(600);
    expect(floats()).toEqual([{ text: '+₡100', cls: 'currency-float currency-float-gain currency-float-badge' }]);
    expect(host.querySelector('span')!.classList.contains('currency-got')).toBe(true);
  });

  it('a new or loaded career is not a spend', () => {
    badge(650);
    badge(1200, 'career-2');
    expect(floats()).toEqual([]);
    expect(host.textContent).toContain('₡1,200');
  });

  it('a ducat spend slides the ducat badge in and floats the amount', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    balance = 120;
    act(() => root.render(<DucatChip />));
    const chip = host.querySelector('.ducat-chip')!;
    expect(chip.classList.contains('is-shown')).toBe(false);
    balance = 95;
    act(() => root.render(<DucatChip />));
    expect(chip.classList.contains('is-shown')).toBe(true);
    expect(floats()).toEqual([{ text: '−₾25', cls: 'currency-float currency-float-spend currency-float-badge' }]);
    act(() => void vi.advanceTimersByTime(3000));
    expect(chip.classList.contains('is-shown')).toBe(false);
    vi.useRealTimers();
  });

  it('signing in (the balance first becoming known) shows nothing', () => {
    balance = null;
    act(() => root.render(<DucatChip />));
    balance = 500;
    act(() => root.render(<DucatChip />));
    expect(host.querySelector('.ducat-chip')!.classList.contains('is-shown')).toBe(false);
    expect(floats()).toEqual([]);
  });
});
