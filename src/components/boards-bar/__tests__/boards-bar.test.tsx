import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardsBar from '../boards-bar';
import usePersistentBoardsBarStore from '../../../stores/use-persistent-boards-bar-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  accountComment: undefined as { communityAddress?: string } | undefined,
  accountCommunityAddresses: ['music-posting.eth'] as string[],
  directories: [
    { address: 'music-posting.eth', title: '/mu/ - Music' },
    { address: 'tech-posting.eth', title: '/g/ - Technology' },
  ] as Array<{ address: string; title?: string }>,
  initializeVisibilityMock: vi.fn(),
  navigateMock: vi.fn(),
  openBoardsBarEditModalMock: vi.fn(),
  openCreateBoardModalMock: vi.fn(),
  openDirectoryModalMock: vi.fn(),
  resolvedCommunityAddress: 'music-posting.eth' as string | undefined,
  showSubscriptionsInBoardsBar: true,
  subscriptions: ['custom.eth'] as string[],
  visibleDirectories: new Set<string>(['mu']),
}));

function useBoardsBarVisibilityStoreMock() {
  return {
    visibleDirectories: testState.visibleDirectories,
    showSubscriptionsInBoardsBar: testState.showSubscriptionsInBoardsBar,
  };
}

useBoardsBarVisibilityStoreMock.getState = () => ({
  initialize: testState.initializeVisibilityMock,
});

vi.mock('react-i18next', () => ({
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

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => undefined,
  useAccountComment: () => testState.accountComment,
}));

vi.mock('@bitsocial/bitsocial-react-hooks/dist/stores/accounts', () => ({
  default: (selector: (state: { activeAccountId: string; accounts: Record<string, { subscriptions: string[] }> }) => unknown) =>
    selector({
      activeAccountId: 'account-1',
      accounts: {
        'account-1': {
          subscriptions: testState.subscriptions,
        },
      },
    }),
}));

vi.mock('../../../hooks/use-account-community-addresses', () => ({
  useAccountCommunityAddresses: () => testState.accountCommunityAddresses,
}));

vi.mock('../../../hooks/use-directories', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/use-directories')>('../../../hooks/use-directories');
  return {
    ...actual,
    useDirectories: () => testState.directories,
  };
});

vi.mock('../../../hooks/use-resolved-community-address', () => ({
  useBoardPath: (communityAddress: string | undefined) => {
    if (communityAddress === 'music-posting.eth') return 'mu';
    if (communityAddress === 'tech-posting.eth') return 'g';
    return communityAddress;
  },
  useResolvedCommunityAddress: () => testState.resolvedCommunityAddress,
}));

vi.mock('../../../stores/use-create-board-modal-store', () => ({
  default: () => ({
    openCreateBoardModal: testState.openCreateBoardModalMock,
  }),
}));

vi.mock('../../../stores/use-boards-bar-edit-modal-store', () => ({
  default: () => ({
    openBoardsBarEditModal: testState.openBoardsBarEditModalMock,
  }),
}));

vi.mock('../../../stores/use-boards-bar-visibility-store', () => ({
  default: useBoardsBarVisibilityStoreMock,
}));

vi.mock('../../../stores/use-directory-modal-store', () => ({
  default: () => ({
    openDirectoryModal: testState.openDirectoryModalMock,
  }),
}));

vi.mock('lodash/debounce', () => ({
  default: <T extends (...args: any[]) => void>(fn: T) => {
    const wrapped = ((...args: Parameters<T>) => fn(...args)) as T & { cancel: () => void };
    wrapped.cancel = () => undefined;
    return wrapped;
  },
}));

let container: HTMLDivElement;
let root: Root;

const findExactText = (text: string) => Array.from(container.querySelectorAll<HTMLElement>('*')).find((element) => element.textContent?.trim() === text);
const getLinkHref = (text: string) =>
  Array.from(container.querySelectorAll<HTMLAnchorElement>('a'))
    .find((element) => element.textContent?.trim() === text)
    ?.getAttribute('href');

const LocationStateProbe = () => {
  const location = useLocation();
  return createElement('output', { 'data-testid': 'location-state' }, JSON.stringify(location.state));
};

const renderBoardsBar = async (initialEntry: string | { pathname: string; state?: unknown }) => {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          Routes,
          {},
          createElement(Route, { path: '/:boardIdentifier/*', element: createElement(React.Fragment, {}, createElement(BoardsBar), createElement(LocationStateProbe)) }),
          createElement(Route, {
            path: '/pending/:accountCommentIndex/*',
            element: createElement(React.Fragment, {}, createElement(BoardsBar), createElement(LocationStateProbe)),
          }),
          createElement(Route, { path: '*', element: createElement(React.Fragment, {}, createElement(BoardsBar), createElement(LocationStateProbe)) }),
        ),
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
};

// The app renders a persistable top copy and a footer copy that stays in place.
const renderTopAndFooterBoardsBars = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/mu'] }, createElement(BoardsBar, { persistable: true }), createElement(BoardsBar)));
  });
};

const scrollWindowTo = async (scrollY: number) => {
  await act(async () => {
    window.scrollY = scrollY;
    window.dispatchEvent(new Event('scroll'));
  });
};

describe('BoardsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.accountComment = undefined;
    testState.accountCommunityAddresses = ['music-posting.eth'];
    testState.directories = [
      { address: 'music-posting.eth', title: '/mu/ - Music' },
      { address: 'tech-posting.eth', title: '/g/ - Technology' },
    ];
    testState.navigateMock.mockReset();
    testState.openBoardsBarEditModalMock.mockReset();
    testState.openCreateBoardModalMock.mockReset();
    testState.openDirectoryModalMock.mockReset();
    testState.initializeVisibilityMock.mockReset();
    testState.resolvedCommunityAddress = 'music-posting.eth';
    testState.showSubscriptionsInBoardsBar = true;
    testState.subscriptions = ['custom.eth'];
    testState.visibleDirectories = new Set(['mu']);

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: false, traditionalBoardList: false, autoHideBoardsBar: false });
  });

  it('renders desktop board groups and subscription links, then opens edit/create/directory actions', async () => {
    await renderBoardsBar('/mu');

    expect(testState.initializeVisibilityMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('all');
    expect(container.textContent).toContain('subs');
    expect(container.textContent).toContain('search');
    expect(container.textContent).toContain('mod');
    expect(container.textContent).toContain('custom.eth');
    expect(container.textContent).toContain('mu');
    expect(container.textContent).not.toContain('g /');

    await act(async () => {
      findExactText('...')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('g');

    await act(async () => {
      findExactText('Edit')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      findExactText('create_board')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(testState.openBoardsBarEditModalMock).toHaveBeenCalledTimes(1);
    expect(testState.openCreateBoardModalMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      findExactText('biz')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(testState.openDirectoryModalMock).toHaveBeenCalledTimes(1);
  });

  it('makes only the persistable instance fixed when the persistent setting is on', async () => {
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: true });
    try {
      await act(async () => {
        root.render(createElement(MemoryRouter, { initialEntries: ['/mu'] }, createElement(BoardsBar, { persistable: true }), createElement(BoardsBar)));
      });

      expect(container.querySelectorAll('[class*="boardNavDesktop"]')).toHaveLength(2);
      expect(container.querySelectorAll('[class*="boardNavDesktop"][class*="persistent"]')).toHaveLength(1);
      expect(container.querySelectorAll('[class*="persistentSpacer"]')).toHaveLength(1);
    } finally {
      usePersistentBoardsBarStore.getState().setPersistentBoardsBar(false);
    }
  });

  it('keeps the pinned board list in view while scrolling when auto-hide is off', async () => {
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: true });
    await renderTopAndFooterBoardsBars();

    const pinnedBar = container.querySelector<HTMLElement>('[class*="boardNavDesktop"][class*="persistent"]');
    expect(pinnedBar?.getAttribute('data-pinned-top-bar')).toBe('fixed');

    await scrollWindowTo(100);

    expect(pinnedBar?.style.transform).toBe('');
  });

  it('swaps the pinned board list bracketed links for the page links', async () => {
    const scrollToMock = vi.fn();
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollToMock, writable: true });
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: true });
    await renderTopAndFooterBoardsBars();

    const pinnedBar = container.querySelector<HTMLElement>('[class*="boardNavDesktop"][class*="persistent"]');
    const footerBar = container.querySelector<HTMLElement>('[class*="boardNavDesktop"]:not([class*="persistent"])');
    expect(pinnedBar?.querySelector('[class*="navTopRight"]')).toBeNull();
    expect(footerBar?.querySelector('[class*="navTopRight"]')).toBeTruthy();

    await act(async () => {
      pinnedBar?.querySelector<HTMLButtonElement>('button[aria-label="Bottom"]')?.click();
    });

    expect(scrollToMock).toHaveBeenCalledWith({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    expect(pinnedBar?.textContent).toContain('settings');
  });

  it('slides the pinned board list out while scrolling down when auto-hide is on', async () => {
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: true, autoHideBoardsBar: true });
    await renderTopAndFooterBoardsBars();

    const pinnedBar = container.querySelector<HTMLElement>('[class*="boardNavDesktop"][class*="persistent"]');
    const footerBar = container.querySelector<HTMLElement>('[class*="boardNavDesktop"]:not([class*="persistent"])');
    expect(pinnedBar?.getAttribute('data-pinned-top-bar')).toBe('auto-hide');

    await scrollWindowTo(100);

    expect(pinnedBar?.style.transform).toBe('translateY(-100%)');
    expect(footerBar?.style.transform).toBe('');

    await scrollWindowTo(60);

    expect(pinnedBar?.style.transform).toBe('');
  });

  it('shows the pinned board list again when auto-hide is turned off and back on', async () => {
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: true, autoHideBoardsBar: true });
    await renderTopAndFooterBoardsBars();
    await scrollWindowTo(100);

    await act(async () => {
      usePersistentBoardsBarStore.setState({ autoHideBoardsBar: false });
    });
    await act(async () => {
      usePersistentBoardsBarStore.setState({ autoHideBoardsBar: true });
    });

    expect(container.querySelector<HTMLElement>('[class*="boardNavDesktop"][class*="persistent"]')?.style.transform).toBe('');
  });

  it('pins the board select instead of the top board list when the traditional list is off', async () => {
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: false });
    await renderTopAndFooterBoardsBars();

    // Only the footer keeps its board list.
    expect(container.querySelectorAll('[class*="boardNavDesktop"]')).toHaveLength(1);
    expect(container.querySelector('[class*="boardNavDesktop"][class*="persistent"]')).toBeNull();
    const pinnedSelectBars = container.querySelectorAll<HTMLElement>('[class*="persistentOnDesktop"]');
    expect(pinnedSelectBars).toHaveLength(1);
    expect(pinnedSelectBars[0].querySelector('select')).toBeTruthy();
    expect(pinnedSelectBars[0].getAttribute('data-pinned-top-bar')).toBe('fixed');
    expect(container.querySelectorAll('[class*="persistentSpacer"]')).toHaveLength(1);

    await scrollWindowTo(100);

    expect(pinnedSelectBars[0].style.transform).toBe('');
  });

  it('slides the pinned board select out while scrolling down when auto-hide is on', async () => {
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: false, autoHideBoardsBar: true });
    await renderTopAndFooterBoardsBars();

    const pinnedSelectBar = container.querySelector<HTMLElement>('[class*="persistentOnDesktop"]');
    expect(pinnedSelectBar?.getAttribute('data-pinned-top-bar')).toBe('auto-hide');

    await scrollWindowTo(100);

    expect(pinnedSelectBar?.style.transform).toBe('translateY(-100%)');
  });

  it('keeps the regular mobile bar on mobile when the traditional list is off', async () => {
    const desktopWidth = window.innerWidth;
    window.innerWidth = 500;
    usePersistentBoardsBarStore.setState({ persistentBoardsBar: true, traditionalBoardList: false });
    try {
      await renderTopAndFooterBoardsBars();

      const mobileBars = container.querySelectorAll<HTMLElement>('[class*="boardNavMobile"]');
      expect(container.querySelector('[class*="persistentOnDesktop"]')).toBeNull();
      expect(container.querySelector('[class*="persistentSpacer"]')).toBeNull();
      expect(container.querySelector('[data-pinned-top-bar]')).toBeNull();

      await scrollWindowTo(100);

      expect(mobileBars[0].style.transform).toBe('translateY(-100%)');
    } finally {
      window.innerWidth = desktopWidth;
    }
  });

  it('links the feedback directory when /q/ is visible', async () => {
    testState.directories = [{ address: '5chan-feedback.bso', title: '/q/ - 5chan Feedback' }];
    testState.visibleDirectories = new Set(['q']);
    testState.resolvedCommunityAddress = '5chan-feedback.bso';

    await renderBoardsBar('/q');

    expect(getLinkHref('q')).toBe('/q');
  });

  it('renders /q/ in the same desktop bracket group as /r9k/, /s5s/, and /vip/', async () => {
    testState.accountCommunityAddresses = [];
    testState.directories = [
      { address: 'robot9002.bso', title: '/r9k/ - ROBOT9002' },
      { address: 'shit-5chan-says.bso', title: '/s5s/ - Shit 5chan Says' },
      { address: 'very-important-posts.bso', title: '/vip/ - Very Important Posts' },
      { address: '5chan-feedback.bso', title: '/q/ - 5chan Feedback' },
    ];
    testState.showSubscriptionsInBoardsBar = false;
    testState.visibleDirectories = new Set(['r9k', 's5s', 'vip', 'q']);

    await renderBoardsBar('/q');

    expect(container.textContent).toContain('[r9k / s5s / vip / q]');
  });

  it('links the search button straight to the archive search', async () => {
    await renderBoardsBar('/mu');

    expect(getLinkHref('Search')).toBe('/search');
    // The floating search bar it used to open is gone.
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });

  it('keeps catalog navigation on desktop multiboard and board links', async () => {
    await renderBoardsBar('/mu/catalog');

    expect(getLinkHref('all')).toBe('/all/catalog');
    expect(getLinkHref('subs')).toBe('/subs/catalog');
    expect(getLinkHref('mod')).toBe('/mod/catalog');
    expect(getLinkHref('mu')).toBe('/mu/catalog');
    expect(getLinkHref('custom.eth')).toBe('/custom.eth/catalog');
  });

  it('keeps catalog navigation on mobile board changes and hides the navbar on downward scroll', async () => {
    await renderBoardsBar('/mu/catalog');

    const select = container.querySelector('select');
    expect(select).toBeTruthy();

    await act(async () => {
      if (select) {
        select.value = 'all';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(testState.navigateMock).toHaveBeenCalledWith('/all/catalog');
    expect(container.querySelector('[class*="boardNavMobile"] button[aria-label="Bottom"]')?.textContent).toBe('▼');

    const mobileNav = container.querySelector<HTMLElement>('[class*="boardNavMobile"]');
    expect(mobileNav?.style.transform).toBe('');

    await act(async () => {
      window.scrollY = 100;
      window.dispatchEvent(new Event('scroll'));
    });

    expect(mobileNav?.style.transform).toBe('translateY(-100%)');
  });

  it('keeps the mobile board context for legacy account comments', async () => {
    testState.resolvedCommunityAddress = undefined;
    testState.accountComment = { communityAddress: 'music-posting.eth' };

    await renderBoardsBar('/pending/7');

    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    expect(Array.from(select?.querySelectorAll('option') ?? []).some((option) => option.value === 'mu')).toBe(true);
  });

  it('keeps the mobile board context from pending route state while the account comment loads', async () => {
    testState.resolvedCommunityAddress = undefined;

    await renderBoardsBar({
      pathname: '/pending/7',
      state: { pendingPost: { communityAddress: 'music-posting.eth', index: 7 } },
    });

    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('mu');
  });

  it('preserves pending route state when opening settings', async () => {
    const routeState = {
      boardPath: 'mu',
      pendingPost: { communityAddress: 'music-posting.eth', index: 7 },
    };
    await renderBoardsBar({ pathname: '/pending/7', state: routeState });

    const settingsLink = Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find((link) => link.textContent === 'settings');
    await act(async () => {
      settingsLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[data-testid="location-state"]')?.textContent).toBe(JSON.stringify(routeState));
  });
});
