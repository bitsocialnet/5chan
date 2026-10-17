import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import type { CatalogSortType } from '../../lib/utils/catalog-sort';
import useHiddenCatalogThreads from '../use-hidden-catalog-threads';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const SPORTS_PUBLIC_KEY = '12D3KooWGJA6zN3Q63FtSgwNhtfA26Skdzdxz5X7A9PFfE4FBMGE';

const testState = vi.hoisted(() => ({
  account: { blockedCids: {} as Record<string, boolean> },
  commentsByCid: {} as Record<string, Comment>,
  directories: [
    { address: 'music-posting.eth', directoryCode: 'mu', title: '/mu/ - Music' },
    { address: 'sports-posting.bso', directoryCode: 'sp', publicKey: '12D3KooWGJA6zN3Q63FtSgwNhtfA26Skdzdxz5X7A9PFfE4FBMGE', title: '/sp/ - Sports' },
  ],
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useComments: ({ commentCids = [] }: { commentCids?: string[] } = {}) => ({
    comments: commentCids.map((cid) => testState.commentsByCid[cid]),
    state: 'succeeded',
  }),
}));

vi.mock('../use-directories', async () => {
  const actual = await vi.importActual<typeof import('../use-directories')>('../use-directories');
  return {
    ...actual,
    useDirectories: () => testState.directories,
  };
});

const Result = ({
  candidateComments = [],
  communityAddresses,
  sortType = 'new',
}: {
  candidateComments?: Comment[];
  communityAddresses: string[];
  sortType?: CatalogSortType;
}) => {
  const { hiddenCatalogThreads, scopeKey } = useHiddenCatalogThreads({ candidateComments, communityAddresses, sortType });
  return (
    <div>
      <span data-testid='hidden-cids'>{hiddenCatalogThreads.map((thread) => thread.cid).join(',')}</span>
      <span data-testid='scope-key'>{scopeKey}</span>
    </div>
  );
};

let container: HTMLDivElement;
let root: Root;

describe('useHiddenCatalogThreads', () => {
  beforeEach(() => {
    testState.account = { blockedCids: {} };
    testState.commentsByCid = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('counts hidden threads for a board reached through a directory alias and public key', async () => {
    testState.account = { blockedCids: { 'hidden-sp-thread': true, 'hidden-sp-reply': true, 'hidden-mu-thread': true } };
    testState.commentsByCid = {
      'hidden-mu-thread': {
        cid: 'hidden-mu-thread',
        communityAddress: 'music-posting.eth',
        postCid: 'hidden-mu-thread',
        timestamp: 100,
      } as Comment,
      'hidden-sp-reply': {
        cid: 'hidden-sp-reply',
        communityAddress: SPORTS_PUBLIC_KEY,
        parentCid: 'hidden-sp-thread',
        postCid: 'hidden-sp-thread',
        timestamp: 101,
      } as Comment,
      'hidden-sp-thread': {
        cid: 'hidden-sp-thread',
        communityAddress: SPORTS_PUBLIC_KEY,
        postCid: 'hidden-sp-thread',
        timestamp: 102,
      } as Comment,
    };

    await act(async () => {
      root.render(createElement(Result, { communityAddresses: ['sports-posting.bso'] }));
    });

    expect(container.querySelector('[data-testid="hidden-cids"]')?.textContent).toBe('hidden-sp-thread');
  });

  it('includes hidden threads from every board in a multiboard scope', async () => {
    testState.account = { blockedCids: { 'hidden-mu-thread': true, 'hidden-other-thread': true, 'hidden-sp-thread': true } };
    testState.commentsByCid = {
      'hidden-mu-thread': {
        cid: 'hidden-mu-thread',
        communityAddress: 'music-posting.eth',
        postCid: 'hidden-mu-thread',
        timestamp: 100,
      } as Comment,
      'hidden-other-thread': {
        cid: 'hidden-other-thread',
        communityAddress: 'other-board.eth',
        postCid: 'hidden-other-thread',
        timestamp: 101,
      } as Comment,
      'hidden-sp-thread': {
        cid: 'hidden-sp-thread',
        communityAddress: SPORTS_PUBLIC_KEY,
        postCid: 'hidden-sp-thread',
        timestamp: 102,
      } as Comment,
    };

    await act(async () => {
      root.render(createElement(Result, { communityAddresses: ['music-posting.eth', 'sports-posting.bso'] }));
    });

    expect(container.querySelector('[data-testid="hidden-cids"]')?.textContent).toBe('hidden-sp-thread,hidden-mu-thread');
  });

  it('uses candidate comments from the current feed when the blocked cid lookup has not loaded the comment', async () => {
    testState.account = { blockedCids: { 'hidden-mu-thread': true } };
    testState.commentsByCid = {};

    await act(async () => {
      root.render(
        createElement(Result, {
          candidateComments: [
            {
              cid: 'hidden-mu-thread',
              communityAddress: 'music-posting.eth',
              postCid: 'hidden-mu-thread',
              timestamp: 100,
            } as Comment,
          ],
          communityAddresses: ['music-posting.eth'],
        }),
      );
    });

    expect(container.querySelector('[data-testid="hidden-cids"]')?.textContent).toBe('hidden-mu-thread');
  });

  it('lists hidden threads in the selected catalog order, by last reply for bump order', async () => {
    testState.account = { blockedCids: { newest: true, 'busiest-oldest': true, 'last-replied': true } };
    testState.commentsByCid = {
      newest: { cid: 'newest', communityAddress: 'music-posting.eth', postCid: 'newest', timestamp: 300, replyCount: 1, lastReplyTimestamp: 310 } as Comment,
      'busiest-oldest': { cid: 'busiest-oldest', communityAddress: 'music-posting.eth', postCid: 'busiest-oldest', timestamp: 100, replyCount: 9 } as Comment,
      'last-replied': {
        cid: 'last-replied',
        communityAddress: 'music-posting.eth',
        postCid: 'last-replied',
        timestamp: 200,
        replyCount: 4,
        lastReplyTimestamp: 900,
      } as Comment,
    };
    const renderOrder = async (sortType: CatalogSortType) => {
      await act(async () => {
        root.render(createElement(Result, { communityAddresses: ['music-posting.eth'], sortType }));
      });
      return container.querySelector('[data-testid="hidden-cids"]')?.textContent;
    };

    expect(await renderOrder('lastReply')).toBe('last-replied,newest,busiest-oldest');
    expect(await renderOrder('active')).toBe('last-replied,newest,busiest-oldest');
    expect(await renderOrder('new')).toBe('newest,last-replied,busiest-oldest');
    expect(await renderOrder('replyCount')).toBe('busiest-oldest,last-replied,newest');
  });
});
