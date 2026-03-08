import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountSubplebbitAddresses } from '../use-account-subplebbit-addresses';
import { useAccountSubplebbitsWithMetadata } from '../use-account-subplebbits-with-metadata';
import useAuthorPrivileges from '../use-author-privileges';
import { useBoardFeedPageSize } from '../use-board-feed-page-size';
import { useBoardPseudonymityMode } from '../use-board-pseudonymity-mode';
import useCountLinksInReplies from '../use-count-links-in-replies';
import { useFilteredDirectoryAddresses } from '../use-filtered-directory-addresses';
import useAllFeedFilterStore from '../../stores/use-all-feed-filter-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  account: undefined as unknown,
  accountSubplebbits: {} as Record<string, unknown>,
  directories: [] as Array<{ address: string; nsfw?: boolean }>,
  directoryLookup: {} as Record<string, unknown>,
  flattenedReplies: [] as unknown[],
  subplebbitSnapshot: undefined as unknown,
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useAccountSubplebbits: () => ({ accountSubplebbits: testState.accountSubplebbits }),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks/dist/lib/utils', () => ({
  flattenCommentsPages: () => testState.flattenedReplies,
}));

vi.mock('../use-directories', () => ({
  useDirectories: () => testState.directories,
  useDirectoryByAddress: (address: string | undefined) => (address ? testState.directoryLookup[address] : undefined),
}));

vi.mock('../use-stable-subplebbit', () => ({
  useSubplebbitField: (_address: string | undefined, selector: (subplebbit: unknown) => unknown) => selector(testState.subplebbitSnapshot),
}));

let latestValue: unknown;
let root: Root;
let container: HTMLDivElement;
let renderCount = 0;

const HookHarness = ({ useValue }: { useValue: () => unknown }) => {
  const value = useValue();
  latestValue = value;
  return null;
};

const renderHookValue = (useValue: () => unknown) => {
  act(() => {
    root.render(createElement(HookHarness, { key: renderCount++, useValue }));
  });

  return latestValue;
};

describe('selector hooks', () => {
  beforeEach(() => {
    latestValue = undefined;
    renderCount = 0;
    localStorage.clear();
    vi.clearAllMocks();
    testState.account = undefined;
    testState.accountSubplebbits = {};
    testState.directories = [];
    testState.directoryLookup = {};
    testState.flattenedReplies = [];
    testState.subplebbitSnapshot = undefined;
    useAllFeedFilterStore.getState().setFilter('all');

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('derives account board addresses and metadata from cached account subplebbits', () => {
    testState.accountSubplebbits = {
      'music.eth': { address: 'music.eth', title: '/mu/ - Music' },
      'tech.eth': { address: 'tech.eth', title: '/g/ - Technology' },
    };

    expect(renderHookValue(() => useAccountSubplebbitAddresses())).toEqual(['music.eth', 'tech.eth']);
    expect(renderHookValue(() => useAccountSubplebbitsWithMetadata())).toEqual([
      { address: 'music.eth', title: '/mu/ - Music' },
      { address: 'tech.eth', title: '/g/ - Technology' },
    ]);
  });

  it('computes moderator privileges and whether the current account authored the comment', () => {
    testState.account = { author: { address: '0xme' } };
    testState.subplebbitSnapshot = {
      roles: {
        '0xauthor': { role: 'moderator' },
        '0xme': { role: 'admin' },
      },
    };

    expect(renderHookValue(() => useAuthorPrivileges({ commentAuthorAddress: '0xauthor', subplebbitAddress: 'music.eth' }))).toEqual({
      isCommentAuthorMod: true,
      isAccountMod: true,
      isAccountCommentAuthor: false,
      commentAuthorRole: 'moderator',
      accountAuthorRole: 'admin',
    });

    expect(renderHookValue(() => useAuthorPrivileges({ commentAuthorAddress: '0xme', subplebbitAddress: 'music.eth' }))).toEqual({
      isCommentAuthorMod: true,
      isAccountMod: true,
      isAccountCommentAuthor: true,
      commentAuthorRole: 'admin',
      accountAuthorRole: 'admin',
    });
  });

  it('derives board page sizes from directory metadata and falls back when unavailable', () => {
    expect(renderHookValue(() => useBoardFeedPageSize({ features: { postsPerPage: 22 } } as never))).toEqual({
      guiPostsPerPage: 22,
      maxGuiPages: 10,
      paginationFeedPostsPerPage: 220,
      infiniteFeedPostsPerPage: 22,
    });

    expect(renderHookValue(() => useBoardFeedPageSize(undefined))).toEqual({
      guiPostsPerPage: 15,
      maxGuiPages: 10,
      paginationFeedPostsPerPage: 150,
      infiniteFeedPostsPerPage: 15,
    });
  });

  it('prefers live pseudonymity metadata and falls back to directory entries', () => {
    testState.directoryLookup = {
      'music.eth': {
        address: 'music.eth',
        features: { pseudonymityMode: 'directory-mode' },
      },
    };
    testState.subplebbitSnapshot = {
      features: { pseudonymityMode: 'live-mode' },
    };

    expect(renderHookValue(() => useBoardPseudonymityMode('music.eth'))).toBe('live-mode');

    testState.subplebbitSnapshot = {
      features: {},
    };

    expect(renderHookValue(() => useBoardPseudonymityMode('music.eth'))).toBe('directory-mode');
  });

  it('counts link-bearing replies and supports a reply preview limit', () => {
    testState.flattenedReplies = [{ link: 'https://a.test' }, { link: undefined }, { link: 'https://b.test' }];

    expect(renderHookValue(() => useCountLinksInReplies({ replies: {} } as never))).toBe(2);
    expect(renderHookValue(() => useCountLinksInReplies({ replies: {} } as never, 2))).toBe(1);
  });

  it('filters directory addresses according to the all-feed mode', () => {
    testState.directories = [{ address: 'music.eth', nsfw: false }, { address: 'flash.eth', nsfw: true }, { address: 'tech.eth' }];

    expect(renderHookValue(() => useFilteredDirectoryAddresses())).toEqual(['music.eth', 'flash.eth', 'tech.eth']);

    act(() => {
      useAllFeedFilterStore.getState().setFilter('nsfw');
    });
    expect(renderHookValue(() => useFilteredDirectoryAddresses())).toEqual(['flash.eth']);

    act(() => {
      useAllFeedFilterStore.getState().setFilter('sfw');
    });
    expect(renderHookValue(() => useFilteredDirectoryAddresses())).toEqual(['music.eth', 'tech.eth']);
  });
});
