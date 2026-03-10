import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostPage, { Post } from '../post';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type TestComment = {
  cid?: string;
  content?: string;
  error?: Error;
  locked?: boolean;
  number?: number;
  parentCid?: string;
  pinned?: boolean;
  postCid?: string;
  replyCount?: number;
  replies?: unknown[];
  state?: string;
  subplebbitAddress?: string;
  timestamp?: number;
  title?: string;
};

const testState = vi.hoisted(() => ({
  cachedComments: {} as Record<string, TestComment>,
  commentsByCid: {} as Record<string, TestComment>,
  directories: [{ address: 'music-posting.eth', title: '/mu/ - Music' }] as Array<{ address: string; title?: string }>,
  editedCommentsByCid: {} as Record<string, TestComment | undefined>,
  isMobile: false,
  navigateMock: vi.fn(),
  resolvedSubplebbitAddress: 'music-posting.eth' as string | undefined,
  subplebbit: {
    error: undefined as Error | undefined,
    shortAddress: 'music-posting.eth',
    title: '/mu/ - Music',
  },
  subplebbitSnapshot: {
    roles: {
      '0xmod': { role: 'admin' },
    },
  } as { roles?: Record<string, unknown> },
}));

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

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useComment: ({ commentCid }: { commentCid?: string }) => (commentCid ? testState.commentsByCid[commentCid] : undefined),
  useEditedComment: ({ comment }: { comment?: TestComment }) => ({
    editedComment: comment?.cid ? testState.editedCommentsByCid[comment.cid] : undefined,
  }),
  useSubplebbit: () => testState.subplebbit,
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks/dist/stores/subplebbits-pages', () => ({
  default: (selector: (state: { comments: typeof testState.cachedComments }) => unknown) =>
    selector({
      comments: testState.cachedComments,
    }),
}));

vi.mock('../../../hooks/use-stable-subplebbit', () => ({
  useSubplebbitField: (_address: string | undefined, selector: (subplebbit: typeof testState.subplebbitSnapshot) => unknown) => selector(testState.subplebbitSnapshot),
}));

vi.mock('../../../hooks/use-resolved-subplebbit-address', () => ({
  useResolvedSubplebbitAddress: () => testState.resolvedSubplebbitAddress,
}));

vi.mock('../../../hooks/use-directories', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/use-directories')>('../../../hooks/use-directories');
  return {
    ...actual,
    useDirectories: () => testState.directories,
  };
});

vi.mock('../../../hooks/use-is-mobile', () => ({
  default: () => testState.isMobile,
}));

vi.mock('../../../components/error-display/error-display', () => ({
  default: ({ error }: { error?: Error }) => createElement('div', { 'data-testid': 'error-display' }, error?.message || 'no-error'),
}));

vi.mock('../../../components/footer', () => ({
  PageFooterDesktop: ({ firstRow, styleRow }: { firstRow: React.ReactNode; styleRow: React.ReactNode }) =>
    createElement('div', { 'data-testid': 'page-footer-desktop' }, firstRow, styleRow),
  ThreadFooterFirstRow: ({
    isThreadClosed,
    postCid,
    subplebbitAddress,
    threadNumber,
  }: {
    isThreadClosed: boolean;
    postCid: string;
    subplebbitAddress: string;
    threadNumber?: number;
  }) => createElement('div', { 'data-testid': 'thread-footer-first-row' }, `${postCid}:${threadNumber}:${subplebbitAddress}:${String(isThreadClosed)}`),
  ThreadFooterMobile: ({
    isThreadClosed,
    postCid,
    subplebbitAddress,
    threadNumber,
  }: {
    isThreadClosed: boolean;
    postCid: string;
    subplebbitAddress: string;
    threadNumber?: number;
  }) => createElement('div', { 'data-testid': 'thread-footer-mobile' }, `${postCid}:${threadNumber}:${subplebbitAddress}:${String(isThreadClosed)}`),
  ThreadFooterStyleRow: () => createElement('div', { 'data-testid': 'thread-footer-style-row' }, 'thread-footer-style-row'),
}));

vi.mock('../../../components/post-desktop', () => ({
  default: ({ post, roles, targetReplyCid }: { post?: TestComment; roles?: Record<string, unknown>; targetReplyCid?: string }) =>
    createElement(
      'div',
      { 'data-testid': 'post-desktop' },
      createElement('div', { 'data-thread-container-cid': post?.cid }),
      createElement('div', { 'data-post-info-cid': post?.cid }),
      `${post?.cid || 'missing'}:${targetReplyCid || 'none'}:${Object.keys(roles || {}).length}`,
    ),
}));

vi.mock('../../../components/post-mobile', () => ({
  default: ({ post, roles, targetReplyCid }: { post?: TestComment; roles?: Record<string, unknown>; targetReplyCid?: string }) =>
    createElement(
      'div',
      { 'data-testid': 'post-mobile' },
      createElement('div', { 'data-thread-container-cid': post?.cid }),
      createElement('div', { 'data-post-info-cid': post?.cid }),
      `${post?.cid || 'missing'}:${targetReplyCid || 'none'}:${Object.keys(roles || {}).length}`,
    ),
}));

let container: HTMLDivElement;
let root: Root;

const flushEffects = async (count = 5) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderPostPage = async (initialEntry: string) => {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          Routes,
          {},
          createElement(Route, { path: '/all/thread/:commentCid', element: createElement(PostPage) }),
          createElement(Route, { path: '/:boardIdentifier/thread/:commentCid', element: createElement(PostPage) }),
        ),
      ),
    );
  });
  await flushEffects();
};

describe('Post', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.cachedComments = {};
    testState.commentsByCid = {};
    testState.directories = [{ address: 'music-posting.eth', title: '/mu/ - Music' }];
    testState.editedCommentsByCid = {};
    testState.isMobile = false;
    testState.resolvedSubplebbitAddress = 'music-posting.eth';
    testState.subplebbit = {
      error: undefined,
      shortAddress: 'music-posting.eth',
      title: '/mu/ - Music',
    };
    testState.subplebbitSnapshot = {
      roles: {
        '0xmod': { role: 'admin' },
      },
    };
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    document.title = 'before';

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders edited posts through the desktop and mobile presenters with stable role data', async () => {
    testState.editedCommentsByCid = {
      'post-1': { cid: 'edited-post', subplebbitAddress: 'music-posting.eth' },
    };

    await act(async () => {
      root.render(createElement(Post, { post: { cid: 'post-1', subplebbitAddress: 'music-posting.eth' } }));
    });
    expect(container.querySelector('[data-testid="post-desktop"]')?.textContent).toBe('edited-post:none:1');

    testState.isMobile = true;
    await act(async () => {
      root.render(createElement(Post, { post: { cid: 'post-2', subplebbitAddress: 'music-posting.eth' } }));
    });
    expect(container.querySelector('[data-testid="post-mobile"]')?.textContent).toBe('post-2:none:1');
  });

  it('hydrates thread pages from cached feed data, sets the document title, and renders thread footers', async () => {
    testState.commentsByCid = {
      'cached-cid': {
        cid: 'cached-cid',
        state: 'updating',
        subplebbitAddress: 'music-posting.eth',
      },
    };
    testState.cachedComments = {
      'cached-cid': {
        cid: 'cached-cid',
        content: 'cached body',
        number: 42,
        replyCount: 0,
        subplebbitAddress: 'music-posting.eth',
        title: 'Cached thread',
      },
    };

    await renderPostPage('/mu/thread/cached-cid');

    expect(container.querySelector('[data-testid="post-desktop"]')?.textContent).toBe('cached-cid:none:1');
    expect(container.querySelector('[data-testid="thread-footer-first-row"]')?.textContent).toBe('cached-cid:42:music-posting.eth:false');
    expect(container.querySelector('[data-testid="thread-footer-mobile"]')?.textContent).toBe('cached-cid:42:music-posting.eth:false');
    expect(document.title).toBe('/mu/ - Cached thread... - 5chan');
    expect(window.scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 0,
      top: 0,
    });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('redirects thread routes whose fetched comment belongs to a different board', async () => {
    testState.commentsByCid = {
      'comment-1': {
        cid: 'comment-1',
        postCid: 'comment-1',
        subplebbitAddress: 'other.eth',
        title: 'Other board thread',
      },
    };

    await renderPostPage('/mu/thread/comment-1');

    expect(testState.navigateMock).toHaveBeenCalledWith('/not-found', { replace: true });
  });

  it('renders reply pages using the root post, highlights the reply target, and shows thread errors', async () => {
    testState.commentsByCid = {
      'reply-cid': {
        cid: 'reply-cid',
        parentCid: 'root-cid',
        postCid: 'root-cid',
        subplebbitAddress: 'music-posting.eth',
      },
      'root-cid': {
        cid: 'root-cid',
        error: new Error('thread failed'),
        locked: true,
        number: 99,
        replies: [],
        replyCount: 4,
        subplebbitAddress: 'music-posting.eth',
        title: 'Root thread',
      },
    };

    await renderPostPage('/mu/thread/reply-cid');

    expect(container.querySelector('[data-testid="post-desktop"]')?.textContent).toBe('root-cid:reply-cid:1');
    expect(container.querySelector('[data-testid="thread-footer-first-row"]')?.textContent).toBe('root-cid:99:music-posting.eth:true');
    expect(container.textContent).toContain('thread failed');
  });

  it('shows missing-comment and board-load errors when no thread can be resolved', async () => {
    testState.commentsByCid = {
      'missing-cid': {
        error: new Error('missing comment'),
      },
    };
    testState.subplebbit = {
      error: new Error('board failed'),
      shortAddress: 'music-posting.eth',
      title: '/mu/ - Music',
    };

    await renderPostPage('/mu/thread/missing-cid');

    expect(Array.from(container.querySelectorAll('[data-testid="error-display"]')).map((node) => node.textContent)).toEqual(['board failed', 'missing comment']);
    expect(container.querySelector('[data-testid="thread-footer-first-row"]')).toBeNull();
  });
});
