import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InterfaceSettings from '../interface-settings';
import useFeedViewSettingsStore from '../../../../stores/use-feed-view-settings-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
}));

vi.mock('../../../../stores/use-expanded-media-store', () => ({
  default: () => ({ fitExpandedImagesToScreen: false, setFitExpandedImagesToScreen: vi.fn() }),
}));

vi.mock('../../version', () => ({
  default: () => null,
}));

/** Minimal component that subscribes to feed view settings (like Board) to verify re-renders. */
const BoardModeIndicator = () => {
  const enableInfiniteScroll = useFeedViewSettingsStore((state) => state.enableInfiniteScroll);
  return <span data-testid='board-mode'>{enableInfiniteScroll ? 'infinite' : 'pagination'}</span>;
};

const STORAGE_KEY = 'feed-view-settings-store';

let root: Root;
let container: HTMLDivElement;

const render = (children: React.ReactNode) => {
  act(() => {
    root.render(createElement(MemoryRouter, {}, children));
  });
};

describe('InterfaceSettings', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
    useFeedViewSettingsStore.getState().setEnableInfiniteScroll(false);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setItemSpy.mockRestore();
  });

  it('renders enable_infinite_scroll_tip under the infinite scroll checkbox', () => {
    render(createElement(InterfaceSettings));
    expect(container.textContent).toMatch(/enable_infinite_scroll_tip/i);
  });

  it('renders enable_infinite_scroll checkbox unchecked by default', () => {
    render(createElement(InterfaceSettings));
    const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent?.toLowerCase().includes('enable_infinite_scroll'));
    expect(label).toBeTruthy();
    const checkbox = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    expect(checkbox?.checked).toBe(false);
  });

  it('toggling checkbox updates persisted state and re-renders board mode', async () => {
    render(createElement(React.Fragment, {}, createElement(InterfaceSettings), createElement(BoardModeIndicator)));

    const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent?.toLowerCase().includes('enable_infinite_scroll'));
    const checkbox = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();

    expect(container.querySelector('[data-testid="board-mode"]')?.textContent).toBe('pagination');

    await act(async () => {
      checkbox?.click();
    });

    expect(useFeedViewSettingsStore.getState().enableInfiniteScroll).toBe(true);
    expect(checkbox?.checked).toBe(true);
    expect(container.querySelector('[data-testid="board-mode"]')?.textContent).toBe('infinite');
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"enableInfiniteScroll":true'));
  });
});
