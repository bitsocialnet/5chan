import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

let latestValue: number[] = [];
let root: Root;
let container: HTMLDivElement;

const flushEffects = async (count = 3) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe('useSubplebbitsLoadingStartTimestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    latestValue = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('stores first-seen timestamps per board and only adds new addresses on rerender', async () => {
    const useSubplebbitsLoadingStartTimestamps = (await import('../use-subplebbits-loading-start-timestamps-store')).default;

    const HookHarness = ({ addresses }: { addresses?: string[] }) => {
      const value = useSubplebbitsLoadingStartTimestamps(addresses);
      React.useLayoutEffect(() => {
        latestValue = value;
      }, [value]);
      return null;
    };

    await act(async () => {
      root.render(createElement(HookHarness, { addresses: ['music.eth', 'tech.eth'] }));
    });
    await flushEffects();

    expect(latestValue).toEqual([1_704_067_200, 1_704_067_200]);

    vi.setSystemTime(new Date('2024-01-01T00:10:00Z'));

    await act(async () => {
      root.render(createElement(HookHarness, { addresses: ['music.eth', 'biz.eth'] }));
    });
    await flushEffects();

    expect(latestValue).toEqual([1_704_067_200, 1_704_067_800]);
  });
});
