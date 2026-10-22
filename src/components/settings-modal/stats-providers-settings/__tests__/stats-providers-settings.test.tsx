import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useStatsProvidersStore from '../../../../stores/use-stats-providers-store';
import { PURE_P2P_STATS_STORAGE_KEY } from '../../../../lib/stats-providers';
import StatsProvidersSettings from '../stats-providers-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let container: HTMLDivElement;
let root: Root;

describe('StatsProvidersSettings', () => {
  beforeEach(() => {
    useStatsProvidersStore.getState().setUsePureP2PStats(false);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(StatsProvidersSettings)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.removeItem(PURE_P2P_STATS_STORAGE_KEY);
  });

  it('lists stats.bitsocial.net and explains that pure P2P is the fallback', () => {
    const providerLink = container.querySelector<HTMLAnchorElement>('a[href="https://stats.bitsocial.net"]');
    expect(providerLink?.textContent).toBe('stats.bitsocial.net');
    expect(providerLink?.rel).toBe('noopener noreferrer');
    const providerRadio = container.querySelector<HTMLInputElement>('input[type="radio"][value="stats-bitsocial-net"]');
    expect(providerRadio?.checked).toBe(true);
    expect(providerRadio?.disabled).toBe(true);
    expect(container.textContent).toContain('use_pure_p2p_stats');
    expect(container.textContent).toContain('pure_p2p_stats_tip');
  });

  it('saves the pure P2P choice and clears it again', () => {
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);

    act(() => checkbox.click());
    expect(useStatsProvidersStore.getState().usePureP2PStats).toBe(true);
    expect(localStorage.getItem(PURE_P2P_STATS_STORAGE_KEY)).toBe('true');
    expect(checkbox.checked).toBe(true);

    act(() => checkbox.click());
    expect(useStatsProvidersStore.getState().usePureP2PStats).toBe(false);
    expect(localStorage.getItem(PURE_P2P_STATS_STORAGE_KEY)).toBeNull();
  });
});
