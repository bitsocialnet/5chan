import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type ReplyModalShape = {
  activeCid: string | null;
  closeModal: ReturnType<typeof vi.fn>;
  parentNumber: number | null;
  scrollY: number;
  showReplyModal: boolean;
  subplebbitAddress: string | null;
  threadCid: string | null;
  threadNumber: number | null;
};

const testState = vi.hoisted(() => ({
  account: { author: { address: '0x123' } } as unknown,
  accountComments: {} as Record<number, { subplebbitAddress?: string }>,
  accountSubplebbitAddresses: [] as string[],
  closeCreateBoardModalMock: vi.fn(),
  directories: [
    { address: 'music-posting.eth', title: '/mu/ - Music', nsfw: false },
    { address: 'tech-posting.eth', title: '/g/ - Technology', nsfw: false },
  ] as Array<{ address: string; title?: string; nsfw?: boolean }>,
  initSnowMock: vi.fn(),
  isMobile: false,
  isSpecialEnabled: false,
  removeSnowMock: vi.fn(),
  replyModalState: {
    activeCid: null,
    closeModal: vi.fn(),
    parentNumber: null,
    scrollY: 0,
    showReplyModal: false,
    subplebbitAddress: null,
    threadCid: null,
    threadNumber: null,
  } as ReplyModalShape,
  resolvedSubplebbitAddress: undefined as string | undefined,
  subplebbits: {} as Record<string, unknown>,
  useThemeMock: vi.fn(),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useAccountComment: ({ commentIndex }: { commentIndex?: number }) => (typeof commentIndex === 'number' ? testState.accountComments[commentIndex] : undefined),
  useSubplebbit: ({ subplebbitAddress }: { subplebbitAddress?: string }) => (subplebbitAddress ? testState.subplebbits[subplebbitAddress] : undefined),
}));

vi.mock('../hooks/use-account-subplebbit-addresses', () => ({
  useAccountSubplebbitAddresses: () => testState.accountSubplebbitAddresses,
}));

vi.mock('../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
}));

vi.mock('../hooks/use-is-mobile', () => ({
  default: () => testState.isMobile,
}));

vi.mock('../hooks/use-resolved-subplebbit-address', () => ({
  useResolvedSubplebbitAddress: () => testState.resolvedSubplebbitAddress,
}));

vi.mock('../hooks/use-theme', () => ({
  default: () => testState.useThemeMock(),
}));

vi.mock('../stores/use-create-board-modal-store', () => ({
  default: () => ({
    closeCreateBoardModal: testState.closeCreateBoardModalMock,
  }),
}));

vi.mock('../stores/use-reply-modal-store', () => ({
  default: () => testState.replyModalState,
}));

vi.mock('../stores/use-special-theme-store', () => ({
  default: () => ({
    isEnabled: testState.isSpecialEnabled,
  }),
}));

vi.mock('../lib/snow', () => ({
  initSnow: (options: unknown) => testState.initSnowMock(options),
  removeSnow: () => testState.removeSnowMock(),
}));

vi.mock('../lib/utils/preload-utils', () => ({
  preloadThemeAssets: vi.fn(),
}));

function makeNamedComponent(name: string) {
  return () => createElement('div', { 'data-testid': name }, name);
}

vi.mock('../components/board-buttons', () => ({
  DesktopBoardButtons: makeNamedComponent('desktop-board-buttons'),
  MobileBoardButtons: makeNamedComponent('mobile-board-buttons'),
}));

vi.mock('../components/board-header', () => ({
  default: makeNamedComponent('board-header'),
}));

vi.mock('../components/feed-cache-container', () => ({
  default: makeNamedComponent('feed-cache-container'),
}));

vi.mock('../components/post-form', () => ({
  default: makeNamedComponent('post-form'),
}));

vi.mock('../components/board-blotter', () => ({
  default: makeNamedComponent('board-blotter'),
}));

vi.mock('../components/boards-bar', () => ({
  default: makeNamedComponent('boards-bar'),
}));

vi.mock('../views/board', () => ({
  default: makeNamedComponent('board-view'),
}));

vi.mock('../views/blotter', () => ({
  default: makeNamedComponent('blotter-view'),
}));

vi.mock('../views/catalog', () => ({
  default: makeNamedComponent('catalog-view'),
}));

vi.mock('../views/faq', () => ({
  default: makeNamedComponent('faq-view'),
}));

vi.mock('../views/home', () => ({
  default: makeNamedComponent('home-view'),
}));

vi.mock('../views/mod-queue', () => ({
  default: makeNamedComponent('mod-queue-view'),
}));

vi.mock('../views/not-allowed', () => ({
  default: makeNamedComponent('not-allowed-view'),
}));

vi.mock('../views/not-found', () => ({
  default: makeNamedComponent('not-found-view'),
}));

vi.mock('../views/pending-post', () => ({
  default: makeNamedComponent('pending-post-view'),
}));

vi.mock('../views/post', () => ({
  default: makeNamedComponent('post-view'),
}));

vi.mock('../views/rules', () => ({
  default: makeNamedComponent('rules-view'),
}));

vi.mock('../views/account-data-editor', () => ({
  default: makeNamedComponent('account-data-editor-view'),
}));

vi.mock('../components/boards-bar-edit-modal', () => ({
  default: makeNamedComponent('boards-bar-edit-modal'),
}));

vi.mock('../components/create-board-modal', () => ({
  default: makeNamedComponent('create-board-modal'),
}));

vi.mock('../components/challenge-modal', () => ({
  default: makeNamedComponent('challenge-modal'),
}));

vi.mock('../components/directory-modal', () => ({
  default: makeNamedComponent('directory-modal'),
}));

vi.mock('../components/disclaimer-modal', () => ({
  default: makeNamedComponent('disclaimer-modal'),
}));

vi.mock('../components/settings-modal', () => ({
  default: makeNamedComponent('settings-modal'),
}));

vi.mock('../components/reply-modal', () => ({
  default: ({ parentCid, postCid }: { parentCid: string; postCid: string }) => createElement('div', { 'data-testid': 'reply-modal' }, `${parentCid}:${postCid}`),
}));

let latestLocation = '';
let container: HTMLDivElement;
let root: Root;

const LocationProbe = () => {
  const location = useLocation();
  React.useLayoutEffect(() => {
    latestLocation = `${location.pathname}${location.search}`;
  }, [location.pathname, location.search]);
  return null;
};

const flushEffects = async (count = 8) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderApp = async (initialEntry: string) => {
  latestLocation = initialEntry;
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [initialEntry] }, createElement(App), createElement(LocationProbe)));
  });
  await flushEffects();
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestLocation = '';
    testState.account = { author: { address: '0x123' } };
    testState.accountComments = {};
    testState.accountSubplebbitAddresses = [];
    testState.isMobile = false;
    testState.isSpecialEnabled = false;
    testState.replyModalState = {
      activeCid: null,
      closeModal: vi.fn(),
      parentNumber: null,
      scrollY: 0,
      showReplyModal: false,
      subplebbitAddress: null,
      threadCid: null,
      threadNumber: null,
    } as ReplyModalShape;
    testState.resolvedSubplebbitAddress = undefined;
    testState.subplebbits = {};
    testState.useThemeMock.mockReset();
    testState.closeCreateBoardModalMock.mockReset();
    testState.initSnowMock.mockReset();
    testState.removeSnowMock.mockReset();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders board layout chrome, settings modal, and reply modal wiring on settings routes', async () => {
    testState.replyModalState = {
      activeCid: 'parent-cid',
      closeModal: vi.fn(),
      parentNumber: 12,
      scrollY: 32,
      showReplyModal: true,
      subplebbitAddress: 'music-posting.eth',
      threadCid: 'thread-cid',
      threadNumber: 99,
    } as ReplyModalShape;

    await renderApp('/all/settings');

    expect(container.querySelector('[data-testid="boards-bar"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="board-header"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="post-form"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="feed-cache-container"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-board-buttons"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="board-blotter"]')).toBeNull();
    expect(latestLocation).toBe('/all/settings');
  });

  it('redirects board page 1 feeds to not-found', async () => {
    await renderApp('/mu/1');

    expect(latestLocation).toBe('/not-found');
    expect(container.querySelector('[data-testid="not-found-view"]')).toBeTruthy();
  });

  it('canonicalizes board address routes to directory codes while preserving query strings', async () => {
    await renderApp('/music-posting.eth/thread/comment-1?focus=1');

    expect(latestLocation).toBe('/mu/thread/comment-1?focus=1');
    expect(container.querySelector('[data-testid="post-view"]')).toBeTruthy();
  });

  it('routes invalid mod aliases and unknown mod paths to not-found', async () => {
    await renderApp('/mu/modqueue');
    expect(latestLocation).toBe('/not-found');
    expect(container.querySelector('[data-testid="not-found-view"]')).toBeTruthy();

    await renderApp('/mod/asdf');
    expect(latestLocation).toBe('/mod/asdf');
    expect(container.querySelector('[data-testid="not-found-view"]')).toBeTruthy();
  });

  it('allows the global mod queue only when the account moderates at least one board', async () => {
    testState.accountSubplebbitAddresses = ['music-posting.eth'];
    await renderApp('/mod/queue');

    expect(container.querySelector('[data-testid="mod-queue-view"]')).toBeTruthy();

    act(() => root.unmount());
    root = createRoot(container);

    testState.accountSubplebbitAddresses = [];
    await renderApp('/mod/queue');

    expect(latestLocation).toBe('/not-allowed');
    expect(container.querySelector('[data-testid="not-allowed-view"]')).toBeTruthy();
  });

  it('enforces board-scoped mod queue access by account role', async () => {
    testState.resolvedSubplebbitAddress = 'music-posting.eth';
    testState.subplebbits = {
      'music-posting.eth': {
        state: 'succeeded',
        roles: {
          '0x123': { role: 'moderator' },
        },
      },
    };

    await renderApp('/mu/mod/queue');
    expect(container.querySelector('[data-testid="mod-queue-view"]')).toBeTruthy();

    act(() => root.unmount());
    root = createRoot(container);

    testState.subplebbits = {
      'music-posting.eth': {
        state: 'succeeded',
        roles: {
          '0x123': { role: 'user' },
        },
      },
    };

    await renderApp('/mu/mod/queue');
    expect(latestLocation).toBe('/not-allowed');
    expect(container.querySelector('[data-testid="not-allowed-view"]')).toBeTruthy();
  });

  it('starts and cleans up snow on desktop special-theme board layouts and closes create-board modal on mount', async () => {
    testState.isSpecialEnabled = true;

    await renderApp('/mu');

    expect(testState.initSnowMock).toHaveBeenCalledWith({ flakeCount: 150 });
    expect(testState.closeCreateBoardModalMock).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(testState.removeSnowMock).toHaveBeenCalled();

    root = createRoot(container);
  });
});
