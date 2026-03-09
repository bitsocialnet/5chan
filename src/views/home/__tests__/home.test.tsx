import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '../home';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  closeDirectoryModalMock: vi.fn(),
  directories: [] as Array<{ address: string; title?: string }>,
  directoryAddresses: [] as string[],
  navigateMock: vi.fn(),
  subplebbits: {} as Record<string, unknown>,
  subplebbitsStats: {} as Record<string, { allPostCount?: number; weekActiveUserCount?: number }>,
}));

vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => createElement('span', { 'data-testid': `trans-${i18nKey}` }, i18nKey),
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => testState.navigateMock,
  };
});

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useSubplebbits: () => ({ subplebbits: testState.subplebbits }),
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
  useDirectoryAddresses: () => testState.directoryAddresses,
}));

vi.mock('../../../hooks/use-subplebbits-stats', () => ({
  SubplebbitStatsCollector: ({ subplebbitAddress }: { subplebbitAddress: string }) =>
    createElement('div', { 'data-testid': 'stats-collector', 'data-address': subplebbitAddress }),
  useSubplebbitsStatsStore: (selector: (state: { subplebbitsStats: typeof testState.subplebbitsStats }) => unknown) =>
    selector({ subplebbitsStats: testState.subplebbitsStats }),
}));

vi.mock('../../../stores/use-directory-modal-store', () => ({
  default: () => ({
    closeDirectoryModal: testState.closeDirectoryModalMock,
  }),
}));

vi.mock('../boards-list', () => ({
  default: ({ multisub }: { multisub: unknown[] }) => createElement('div', { 'data-testid': 'boards-list' }, `boards:${multisub.length}`),
}));

vi.mock('../popular-threads-box', () => ({
  default: ({ directories, subplebbits }: { directories: unknown[]; subplebbits: Record<string, unknown> }) =>
    createElement('div', { 'data-testid': 'popular-threads-box' }, `popular:${directories.length}:${Object.keys(subplebbits).length}`),
}));

vi.mock('../../../components/site-legal-meta', () => ({
  default: () => createElement('div', { 'data-testid': 'site-legal-meta' }, 'site-legal-meta'),
}));

vi.mock('../../../components/disclaimer-modal', () => ({
  default: () => createElement('div', { 'data-testid': 'disclaimer-modal' }, 'disclaimer-modal'),
}));

vi.mock('../../../components/directory-modal', () => ({
  default: () => createElement('div', { 'data-testid': 'directory-modal' }, 'directory-modal'),
}));

let container: HTMLDivElement;
let root: Root;

const renderHome = () => {
  act(() => {
    root.render(createElement(MemoryRouter, {}, createElement(Home)));
  });
};

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.title = 'before';
    testState.closeDirectoryModalMock.mockReset();
    testState.navigateMock.mockReset();
    testState.directories = [
      { address: 'music-posting.eth', title: '/mu/ - Music' },
      { address: 'tech-posting.eth', title: '/g/ - Technology' },
    ];
    testState.directoryAddresses = ['music-posting.eth', 'tech-posting.eth'];
    testState.subplebbits = {
      'music-posting.eth': { address: 'music-posting.eth' },
      'tech-posting.eth': { address: 'tech-posting.eth' },
    };
    testState.subplebbitsStats = {
      'music-posting.eth': { allPostCount: 5, weekActiveUserCount: 2 },
      'tech-posting.eth': { allPostCount: 7, weekActiveUserCount: 5 },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the home view chrome, child sections, collectors, and aggregated stats', () => {
    renderHome();

    expect(document.title).toBe('5chan');
    expect(container.querySelector('[data-testid="disclaimer-modal"]')?.textContent).toBe('disclaimer-modal');
    expect(container.querySelector('[data-testid="directory-modal"]')?.textContent).toBe('directory-modal');
    expect(container.querySelector('[data-testid="boards-list"]')?.textContent).toBe('boards:2');
    expect(container.querySelector('[data-testid="popular-threads-box"]')?.textContent).toBe('popular:2:2');
    expect(container.querySelectorAll('[data-testid="stats-collector"]')).toHaveLength(2);
    expect(container.textContent).toContain('total_posts 12');
    expect(container.textContent).toContain('current_users 7');
    expect(container.textContent).toContain('boards_tracked 2');
    expect(container.querySelector('[data-testid="site-legal-meta"]')?.textContent).toBe('site-legal-meta');
  });

  it('navigates to the canonical board path when the search form is submitted', async () => {
    renderHome();

    const input = container.querySelector<HTMLInputElement>('input[type="text"]');
    const form = container.querySelector('form');
    expect(input).toBeTruthy();
    expect(form).toBeTruthy();

    await act(async () => {
      if (input) {
        input.value = 'music-posting.eth';
      }
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(testState.navigateMock).toHaveBeenCalledWith('/mu');
  });

  it('closes the directory modal when the home view unmounts', () => {
    renderHome();
    expect(testState.closeDirectoryModalMock).not.toHaveBeenCalled();

    act(() => root.unmount());

    expect(testState.closeDirectoryModalMock).toHaveBeenCalledTimes(1);

    root = createRoot(container);
  });
});
