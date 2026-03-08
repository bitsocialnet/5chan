import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentTime } from '../use-current-time';
import useIsMobile from '../use-is-mobile';
import useWindowWidth from '../use-window-width';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

let latestValue: unknown;
let root: Root;
let container: HTMLDivElement;

const HookHarness = ({ useValue }: { useValue: () => unknown }) => {
  const value = useValue();
  latestValue = value;
  return null;
};

const renderHookValue = (useValue: () => unknown) => {
  act(() => {
    root.render(createElement(HookHarness, { useValue }));
  });

  return latestValue;
};

describe('browser hooks', () => {
  beforeEach(() => {
    latestValue = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
      writable: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('tracks the window width across resize events', () => {
    expect(renderHookValue(() => useWindowWidth())).toBe(1024);

    act(() => {
      window.innerWidth = 480;
      window.dispatchEvent(new Event('resize'));
    });

    expect(latestValue).toBe(480);
  });

  it('derives the mobile breakpoint from the current window width', () => {
    renderHookValue(() => useIsMobile());
    expect(latestValue).toBe(false);

    act(() => {
      window.innerWidth = 639;
      window.dispatchEvent(new Event('resize'));
    });

    expect(latestValue).toBe(true);
  });

  it('updates the current time on the configured interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    expect(renderHookValue(() => useCurrentTime(30))).toBe(1_704_067_200);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(latestValue).toBe(1_704_067_230);
  });
});
