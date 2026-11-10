import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import communitiesStore from '@bitsocial/bitsocial-react-hooks/dist/stores/communities/index.js';
import communitiesPagesStore from '@bitsocial/bitsocial-react-hooks/dist/stores/communities-pages/index.js';
import usePruneHiddenCatalogThreads from '../use-prune-hidden-catalog-threads';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

// Directory boards have a public key, and the communities store keys them by it (getCommunityRefKey),
// not by the board address the catalog passes in.
const MUSIC_PUBLIC_KEY = 'music-public-key';
// Board updates in these tests come long after the hidden thread was posted, unless a test says otherwise.
const BOARD_UPDATED_AT = 100_000;

const testState = vi.hoisted(() => ({
  account: { id: 'account-1', blockedCids: {} as Record<string, boolean> },
  unblockCidMock: vi.fn(),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', async () => {
  const actual = await vi.importActual<typeof import('@bitsocial/bitsocial-react-hooks')>('@bitsocial/bitsocial-react-hooks');
  return {
    ...actual,
    useAccount: () => testState.account,
  };
});

vi.mock('@bitsocial/bitsocial-react-hooks/dist/stores/accounts', () => ({
  default: {
    getState: () => ({
      accounts: { [testState.account.id]: testState.account },
      accountsActions: {
        unblockCid: testState.unblockCidMock,
      },
      activeAccountId: testState.account.id,
    }),
  },
}));

vi.mock('../use-directories', async () => {
  const actual = await vi.importActual<typeof import('../use-directories')>('../use-directories');
  return {
    ...actual,
    useDirectories: () => [{ address: 'music-posting.eth', directoryCode: 'mu', publicKey: 'music-public-key', title: '/mu/ - Music' }],
  };
});

const hiddenThread = {
  cid: 'hidden-mu-thread',
  communityAddress: 'music-posting.eth',
  postCid: 'hidden-mu-thread',
  timestamp: 1,
  title: 'hidden',
} as Comment;

const visibleThread = {
  cid: 'visible-mu-thread',
  communityAddress: 'music-posting.eth',
  postCid: 'visible-mu-thread',
  title: 'visible',
} as Comment;

const PruneHarness = ({ enabled = true, hiddenThreadCandidates = [hiddenThread] }: { enabled?: boolean; hiddenThreadCandidates?: Comment[] }) => {
  usePruneHiddenCatalogThreads({
    communityAddress: 'music-posting.eth',
    enabled,
    hiddenThreadCandidates,
    sortType: 'new',
  });
  return null;
};

const setRawBoardPage = (comments: Comment[], nextCid?: string) => {
  communitiesStore.setState({
    communities: {
      [MUSIC_PUBLIC_KEY]: {
        address: 'music-posting.eth',
        posts: {
          pageCids: {
            new: 'raw-page-1',
          },
        },
        updatedAt: BOARD_UPDATED_AT,
      },
    },
  });
  communitiesPagesStore.setState({
    communitiesPages: {
      'raw-page-1': {
        comments,
        nextCid,
      },
    },
  });
};

const setPreloadedBoardPage = (comments: Comment[], updatedAt = BOARD_UPDATED_AT) => {
  communitiesStore.setState({
    communities: {
      [MUSIC_PUBLIC_KEY]: {
        address: 'music-posting.eth',
        posts: {
          pageCids: {},
          pages: {
            hot: {
              comments,
            },
          },
        },
        updatedAt,
      },
    },
  });
};

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

let container: HTMLDivElement;
let root: Root;

describe('usePruneHiddenCatalogThreads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.account = { id: 'account-1', blockedCids: { [hiddenThread.cid]: true } };
    testState.unblockCidMock.mockImplementation(async (cid: string) => {
      const blockedCids = { ...testState.account.blockedCids };
      delete blockedCids[cid];
      testState.account = { ...testState.account, blockedCids };
    });
    communitiesStore.setState({ communities: {} });
    communitiesPagesStore.setState({ communitiesPages: {}, comments: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    communitiesStore.setState({ communities: {} });
    communitiesPagesStore.setState({ communitiesPages: {}, comments: {} });
  });

  it('does not unhide a thread just because the visible feed filtered it out', async () => {
    setRawBoardPage([hiddenThread, visibleThread]);

    await act(async () => {
      root.render(createElement(PruneHarness));
    });
    await flushEffects();

    expect(testState.unblockCidMock).not.toHaveBeenCalled();
    expect(testState.account.blockedCids).toEqual({ [hiddenThread.cid]: true });
  });

  it('unhides a stale hidden thread when a fully loaded raw board page proves it is gone', async () => {
    setRawBoardPage([visibleThread]);

    await act(async () => {
      root.render(createElement(PruneHarness));
    });
    await flushEffects();

    expect(testState.unblockCidMock).toHaveBeenCalledWith(hiddenThread.cid);
    expect(testState.account.blockedCids).toEqual({});
  });

  it('prunes against the complete preloaded page of a single-page board', async () => {
    setPreloadedBoardPage([visibleThread]);

    await act(async () => {
      root.render(createElement(PruneHarness));
    });
    await flushEffects();

    expect(testState.unblockCidMock).toHaveBeenCalledWith(hiddenThread.cid);
    expect(testState.account.blockedCids).toEqual({});
  });

  it('keeps a hidden thread posted after the board last updated, since its pages cannot list it yet', async () => {
    const justPostedHiddenThread = { ...hiddenThread, timestamp: 200 } as Comment;
    setPreloadedBoardPage([visibleThread], 100);

    await act(async () => {
      root.render(createElement(PruneHarness, { hiddenThreadCandidates: [justPostedHiddenThread] }));
    });
    await flushEffects();

    expect(testState.unblockCidMock).not.toHaveBeenCalled();
    expect(testState.account.blockedCids).toEqual({ [hiddenThread.cid]: true });
  });

  it('keeps a hidden thread when the board updated only shortly after the thread was posted', async () => {
    // The board accepts a thread stamped up to 5 minutes behind its own clock, and the challenge
    // exchange can take longer, so an update stamped after the thread can still predate it.
    const recentHiddenThread = { ...hiddenThread, timestamp: 200 } as Comment;
    setPreloadedBoardPage([visibleThread], 210);

    await act(async () => {
      root.render(createElement(PruneHarness, { hiddenThreadCandidates: [recentHiddenThread] }));
    });
    await flushEffects();

    expect(testState.unblockCidMock).not.toHaveBeenCalled();
    expect(testState.account.blockedCids).toEqual({ [hiddenThread.cid]: true });
  });

  it('keeps a hidden thread that is waiting for mod approval, since the board pages do not list it', async () => {
    const pendingHiddenThread = { ...hiddenThread, pendingApproval: true } as Comment;
    setPreloadedBoardPage([visibleThread]);

    await act(async () => {
      root.render(createElement(PruneHarness, { hiddenThreadCandidates: [pendingHiddenThread] }));
    });
    await flushEffects();

    expect(testState.unblockCidMock).not.toHaveBeenCalled();
    expect(testState.account.blockedCids).toEqual({ [hiddenThread.cid]: true });
  });

  it('waits for the entire raw board page chain before pruning', async () => {
    setRawBoardPage([visibleThread], 'raw-page-2');

    await act(async () => {
      root.render(createElement(PruneHarness));
    });
    await flushEffects();

    expect(testState.unblockCidMock).not.toHaveBeenCalled();
    expect(testState.account.blockedCids).toEqual({ [hiddenThread.cid]: true });
  });
});
