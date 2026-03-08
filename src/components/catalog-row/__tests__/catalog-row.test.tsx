import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogRow, { CatalogPostMedia } from '../catalog-row';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type TestComment = {
  author?: {
    address?: string;
    displayName?: string;
  };
  cid: string;
  content?: string;
  link?: string;
  linkHeight?: number;
  linkWidth?: number;
  locked?: boolean;
  parentCid?: string;
  pinned?: boolean;
  postCid?: string;
  removed?: boolean;
  replyCount?: number;
  spoiler?: boolean;
  subplebbitAddress?: string;
  thumbnailUrl?: string;
  timestamp?: number;
  title?: string;
};

const testState = vi.hoisted(() => ({
  directories: [{ address: 'music-posting.eth', features: {}, title: '/mu/ - Music' }] as Array<{
    address: string;
    features?: Record<string, unknown>;
    title?: string;
  }>,
  gifFrameStatus: 'idle' as 'failed' | 'idle' | 'ready',
  gifFrameUrl: undefined as string | undefined,
  hiddenCids: new Set<string>(),
  imageSize: 'Small' as 'Large' | 'Small',
  linkCount: 0,
  matchedFilters: new Map<string, string>(),
  mediaInfoByLink: {} as Record<string, { patternThumbnailUrl?: string; thumbnail?: string; type: string; url: string }>,
  replies: [] as TestComment[],
  roleByAddress: {} as Record<string, { commentAuthorRole?: string; isCommentAuthorMod: boolean }>,
  showOPComment: true,
  showSnow: false,
}));

function getCatalogFiltersState() {
  return {
    matchedFilters: testState.matchedFilters,
  };
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks', () => ({
  useReplies: ({ comment }: { comment?: TestComment }) => ({
    replies: comment ? testState.replies : [],
  }),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks/dist/lib/localforage-lru/index.js', () => ({
  default: {
    createInstance: () => ({
      entries: vi.fn().mockResolvedValue([]),
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    }),
  },
}));

vi.mock('@floating-ui/react', () => ({
  offset: () => ({}),
  size: () => ({}),
  useFloating: () => ({
    floatingStyles: {},
    refs: {
      floating: { current: null },
      reference: { current: null },
      setFloating: () => undefined,
      setReference: () => undefined,
    },
    update: () => undefined,
  }),
}));

vi.mock('../../../lib/get-short-address', () => ({
  default: () => 'mu',
}));

vi.mock('../../../lib/snow', () => ({
  shouldShowSnow: () => testState.showSnow,
}));

vi.mock('../../../lib/utils/time-utils', () => ({
  getFormattedTimeAgo: (timestamp?: number) => `ago:${timestamp}`,
}));

vi.mock('../../../lib/utils/post-menu-props', () => ({
  selectPostMenuProps: (post?: TestComment) => ({ cid: post?.cid }),
}));

vi.mock('../../../hooks/use-directories', () => ({
  findDirectoryByAddress: (directories: typeof testState.directories, address?: string) => directories.find((entry) => entry.address === address),
  normalizeBoardAddress: (address: string) => address,
  useDirectories: () => testState.directories,
}));

vi.mock('../../../stores/use-catalog-filters-store', () => ({
  default: <T,>(selector?: (state: ReturnType<typeof getCatalogFiltersState>) => T) => {
    const state = getCatalogFiltersState();
    return selector ? selector(state) : (state as T);
  },
}));

vi.mock('../../../stores/use-catalog-style-store', () => ({
  default: () => ({
    imageSize: testState.imageSize,
    showOPComment: testState.showOPComment,
  }),
}));

vi.mock('../../../hooks/use-author-privileges', () => ({
  default: ({ commentAuthorAddress }: { commentAuthorAddress?: string }) =>
    testState.roleByAddress[commentAuthorAddress || ''] || {
      commentAuthorRole: undefined,
      isCommentAuthorMod: false,
    },
}));

vi.mock('../../../hooks/use-comment-media-info', () => ({
  useCommentMediaInfo: (link?: string) => (link ? testState.mediaInfoByLink[link] : undefined),
}));

vi.mock('../../../hooks/use-count-links-in-replies', () => ({
  default: () => testState.linkCount,
}));

vi.mock('../../../hooks/use-fetch-gif-first-frame', () => ({
  default: () => ({
    frameUrl: testState.gifFrameUrl,
    status: testState.gifFrameStatus,
  }),
}));

vi.mock('../../../hooks/use-hide', () => ({
  default: ({ cid }: { cid: string }) => ({
    hidden: testState.hiddenCids.has(cid),
  }),
}));

vi.mock('../../post-desktop/post-menu-desktop', () => ({
  default: ({ postMenu }: { postMenu: { cid?: string } }) => createElement('span', { 'data-testid': `post-menu-${postMenu.cid}` }, 'menu'),
}));

let container: HTMLDivElement;
let root: Root;

const flushEffects = async (count = 3) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderWithRouter = async (element: React.ReactNode, initialEntry = '/mu/catalog') => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [initialEntry] }, element));
  });
  await flushEffects();
};

describe('CatalogRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    testState.directories = [{ address: 'music-posting.eth', features: {}, title: '/mu/ - Music' }];
    testState.gifFrameStatus = 'idle';
    testState.gifFrameUrl = undefined;
    testState.hiddenCids = new Set<string>();
    testState.imageSize = 'Small';
    testState.linkCount = 0;
    testState.matchedFilters = new Map<string, string>();
    testState.mediaInfoByLink = {};
    testState.replies = [];
    testState.roleByAddress = {};
    testState.showOPComment = true;
    testState.showSnow = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  it('renders gif frames with matched filter borders and falls back to deleted media on load errors', async () => {
    testState.gifFrameStatus = 'ready';
    testState.gifFrameUrl = 'https://cdn.example/frame.png';
    testState.matchedFilters = new Map([['post-1', 'red']]);

    await act(async () => {
      root.render(
        createElement(CatalogPostMedia, {
          cid: 'post-1',
          commentMediaInfo: { type: 'gif', url: 'https://example.com/source.gif' },
          linkHeight: 200,
          linkWidth: 400,
        }),
      );
    });

    const wrapper = container.firstElementChild as HTMLElement | null;
    const frameImage = container.querySelector<HTMLImageElement>('img[src="https://cdn.example/frame.png"]');

    expect(wrapper?.style.border).toContain('red');
    expect(frameImage).toBeTruthy();

    await act(async () => {
      frameImage?.dispatchEvent(new Event('error', { bubbles: true }));
    });

    expect(container.querySelector<HTMLImageElement>('img[src="assets/filedeleted-res.gif"]')).toBeTruthy();
  });

  it('renders audio players and video first-frame fallbacks for media without thumbnails', async () => {
    await act(async () => {
      root.render(
        createElement(CatalogPostMedia, {
          cid: 'audio-post',
          commentMediaInfo: { type: 'audio', url: 'https://example.com/file.mp3' },
        }),
      );
    });

    expect(container.querySelector<HTMLAudioElement>('audio[src="https://example.com/file.mp3"]')).toBeTruthy();

    await act(async () => {
      root.render(
        createElement(CatalogPostMedia, {
          cid: 'video-post',
          commentMediaInfo: { type: 'video', url: 'https://example.com/file.mp4' },
        }),
      );
    });

    expect(container.querySelector<HTMLVideoElement>('video[src="https://example.com/file.mp4#t=0.001"]')).toBeTruthy();
  });

  it('renders media posts with board links, counts, and hover previews in all view', async () => {
    testState.directories = [{ address: 'music-posting.eth', features: { requirePostLinkIsMedia: true }, title: '/mu/ - Music' }];
    testState.linkCount = 2;
    testState.mediaInfoByLink['https://example.com/media.png'] = { type: 'image', url: 'https://example.com/media.png' };
    testState.replies = [
      {
        author: { address: 'author-2', displayName: 'Bob' },
        cid: 'reply-1',
        timestamp: 200,
      },
    ];
    testState.roleByAddress = {
      'author-1': { commentAuthorRole: 'Owner', isCommentAuthorMod: true },
      'author-2': { commentAuthorRole: 'Janitor', isCommentAuthorMod: true },
    };

    const post: TestComment = {
      author: { address: 'author-1', displayName: 'Alice' },
      cid: 'post-1',
      content: 'Hello **world**',
      link: 'https://example.com/media.png',
      linkHeight: 120,
      linkWidth: 200,
      locked: true,
      pinned: true,
      replyCount: 5,
      subplebbitAddress: 'music-posting.eth',
      timestamp: 100,
      title: 'Thread title',
    };

    await renderWithRouter(createElement(CatalogRow, { row: [post] }), '/all/catalog');
    vi.useFakeTimers();

    const postLink = document.body.querySelector<HTMLAnchorElement>('a[href="/mu/thread/post-1"]');
    expect(postLink).toBeTruthy();
    expect(container.textContent).toContain('R: 5');
    expect(container.textContent).toContain('/ I: 2');
    expect(container.querySelector('[data-testid="post-menu-post-1"]')?.textContent).toBe('menu');

    const previewTrigger = document.body.querySelector('a[href="/mu/thread/post-1"] > div');
    await act(async () => {
      previewTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(260);
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('Thread title by Alice ## Board Owner');
    expect(document.body.textContent).toContain('to p/mu');
    expect(document.body.textContent).toContain('last_reply_by Bob ## Board Janitor');
    expect(document.body.textContent).toContain('ago:100');
    expect(document.body.textContent).toContain('ago:200');
  });

  it('renders hidden and text-only threads with canonical board thread links', async () => {
    testState.hiddenCids = new Set(['hidden-1']);
    testState.showOPComment = false;

    const posts: TestComment[] = [
      {
        author: { address: 'hidden-author', displayName: 'Ghost' },
        cid: 'hidden-1',
        content: 'hidden text',
        link: 'https://example.com/hidden.png',
        subplebbitAddress: 'music-posting.eth',
      },
      {
        author: { address: 'text-author', displayName: 'Anon' },
        cid: 'text-1',
        content: 'Plain thread body',
        replyCount: 1,
        subplebbitAddress: 'music-posting.eth',
        title: 'Text title',
      },
    ];

    await renderWithRouter(createElement(CatalogRow, { row: posts }), '/mu/catalog');

    const links = Array.from(document.body.querySelectorAll<HTMLAnchorElement>('a')).map((link) => link.getAttribute('href'));
    expect(links).toContain('/mu/thread/hidden-1');
    expect(links).toContain('/mu/thread/text-1');
    expect(container.textContent).toContain('(hidden)');
    expect(container.textContent).toContain('Text title: Plain thread body');
  });
});
