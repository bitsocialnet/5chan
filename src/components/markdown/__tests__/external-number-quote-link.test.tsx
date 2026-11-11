import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter, MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExternalNumberQuoteLink from '../external-number-quote-link';
import postStyles from '../../post-styles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  resolveExternalQuoteTargetMock: vi.fn(),
  setErrorStatusMock: vi.fn(),
  useCommentMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.quote && options?.board) {
        return `${key}:${options.quote}:${options.board}`;
      }

      return key;
    },
  }),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => ({ id: 'account-1' }),
  useComment: (options: unknown) => testState.useCommentMock(options),
}));

vi.mock('@floating-ui/react', () => ({
  autoUpdate: () => undefined,
  offset: () => ({}),
  shift: () => ({}),
  size: () => ({}),
  useFloating: () => ({
    floatingStyles: {},
    refs: {
      setFloating: () => undefined,
      setReference: () => undefined,
    },
  }),
}));

vi.mock('../../../hooks/use-directories', () => ({
  findDirectoryByAddress: () => undefined,
  useDirectories: () => [],
}));

vi.mock('../../../hooks/use-is-mobile', () => ({
  default: () => false,
}));

vi.mock('../../../lib/utils/external-quote-resolver', () => ({
  resolveExternalQuoteTarget: (...args: unknown[]) => testState.resolveExternalQuoteTargetMock(...args),
}));

vi.mock('../../../stores/use-external-quote-status-store', () => ({
  default: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      clearStatus: vi.fn(),
      setErrorStatus: testState.setErrorStatusMock,
      setLoadingStatus: vi.fn(),
    }),
}));

vi.mock('../../loading-ellipsis', () => ({
  default: ({ string }: { string: string }) => createElement('div', { 'data-testid': 'loading-ellipsis' }, string),
}));

vi.mock('../../../hooks/use-quote-preview-post', () => {
  const PreviewPost = ({ post }: { post?: { cid?: string } }) => createElement('div', { 'data-testid': 'post-preview' }, post?.cid || 'missing-post');
  return { useQuotePreviewPost: () => (props: { post?: { cid?: string } }) => createElement(PreviewPost, props) };
});

let container: HTMLDivElement;
let root: Root;

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createReference = (number: number) => ({
  boardIdentifier: 'fit',
  kind: 'cross-board' as const,
  number,
  raw: `>>>/fit/${number}`,
});

const createTarget = (number: number) => ({
  boardPath: 'fit',
  cid: `cid-${number}`,
  comment: { cid: `cid-${number}` },
  isUnavailable: false,
  route: `/fit/thread/cid-${number}`,
  communityAddress: 'fit',
});

let navigateInApp: NavigateFunction | undefined;

const LocationProbe = () => {
  const location = useLocation();
  navigateInApp = useNavigate();
  return createElement('div', { 'data-testid': 'location' }, location.pathname);
};

const getRenderedPathname = () => container.querySelector('[data-testid="location"]')?.textContent;

const renderLinksInHashRouter = async (numbers: number[]) => {
  await act(async () => {
    root.render(
      createElement(
        HashRouter,
        {},
        ...numbers.map((number) => createElement(ExternalNumberQuoteLink, { key: number, reference: createReference(number) })),
        createElement(LocationProbe),
      ),
    );
  });
};

const clickLink = async (index: number) => {
  await act(async () => {
    container.querySelectorAll('a')[index]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
};

const settle = async (callback: () => void) => {
  await act(async () => {
    callback();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const renderLink = async (number: number) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, {}, createElement(ExternalNumberQuoteLink, { reference: createReference(number) })));
  });
};

const hoverLink = async () => {
  await settle(() => {
    container.querySelector('a')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
};

const leaveLink = async () => {
  await settle(() => {
    container.querySelector('a')?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });
};

const getPreviewText = () => document.body.querySelector(`.${postStyles.replyQuotePreview}`)?.textContent;

describe('ExternalNumberQuoteLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.useCommentMock.mockReturnValue(undefined);
    window.history.replaceState(null, '', '#/biz/thread/current');
    navigateInApp = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses hash-router hrefs for external numeric quotes', async () => {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          {},
          createElement(ExternalNumberQuoteLink, {
            reference: {
              boardIdentifier: 'fit',
              kind: 'cross-board',
              number: 77,
              raw: '>>>/fit/77',
            },
          }),
        ),
      );
    });

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('#/fit');
    expect(link?.textContent).toBe('>>>/fit/77');
  });

  it('shows the resolved post in the hover preview after lazy resolution', async () => {
    testState.resolveExternalQuoteTargetMock.mockResolvedValue({
      boardPath: 'fit',
      cid: 'cid-77',
      comment: { cid: 'cid-77' },
      isUnavailable: false,
      route: '/fit/thread/cid-77',
      communityAddress: 'fit',
    });

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          {},
          createElement(ExternalNumberQuoteLink, {
            reference: {
              boardIdentifier: 'fit',
              kind: 'cross-board',
              number: 77,
              raw: '>>>/fit/77',
            },
          }),
        ),
      );
    });

    await act(async () => {
      container.querySelector('a')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.querySelector('[data-testid="post-preview"]')?.textContent).toBe('cid-77');
  });

  it('uses the OP preview width class for resolved external OP previews', async () => {
    testState.resolveExternalQuoteTargetMock.mockResolvedValue({
      boardPath: 'fit',
      cid: 'cid-77',
      comment: { cid: 'cid-77' },
      isUnavailable: false,
      route: '/fit/thread/cid-77',
      communityAddress: 'fit',
    });

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          {},
          createElement(ExternalNumberQuoteLink, {
            reference: {
              boardIdentifier: 'fit',
              kind: 'cross-board',
              number: 77,
              raw: '>>>/fit/77',
            },
          }),
        ),
      );
    });

    await act(async () => {
      container.querySelector('a')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const preview = document.body.querySelector(`.${postStyles.replyQuotePreview}`);
    expect(preview?.classList.contains(postStyles.replyQuotePreviewOp)).toBe(true);
  });

  it('navigates to the clicked quote once it resolves', async () => {
    const resolution = createDeferred<ReturnType<typeof createTarget>>();
    testState.resolveExternalQuoteTargetMock.mockReturnValue(resolution.promise);

    await renderLinksInHashRouter([77]);
    await clickLink(0);
    await settle(() => resolution.resolve(createTarget(77)));

    expect(getRenderedPathname()).toBe('/fit/thread/cid-77');
  });

  it('does not navigate when the user moved to another page before the clicked quote resolved', async () => {
    const resolution = createDeferred<ReturnType<typeof createTarget>>();
    testState.resolveExternalQuoteTargetMock.mockReturnValue(resolution.promise);

    await renderLinksInHashRouter([77]);
    await clickLink(0);
    await act(async () => {
      navigateInApp?.('/biz/catalog');
    });
    await settle(() => resolution.resolve(createTarget(77)));

    expect(getRenderedPathname()).toBe('/biz/catalog');
    expect(container.querySelector('a')?.getAttribute('aria-busy')).toBeNull();
  });

  it('does not report a failed search on a page the user moved to', async () => {
    const resolution = createDeferred<null>();
    testState.resolveExternalQuoteTargetMock.mockReturnValue(resolution.promise);

    await renderLinksInHashRouter([77]);
    await clickLink(0);
    await act(async () => {
      navigateInApp?.('/biz/catalog');
    });
    await settle(() => resolution.resolve(null));

    expect(testState.setErrorStatusMock).not.toHaveBeenCalled();
  });

  it('does not navigate when the user left and came back before the clicked quote resolved', async () => {
    const resolution = createDeferred<ReturnType<typeof createTarget>>();
    testState.resolveExternalQuoteTargetMock.mockReturnValue(resolution.promise);

    await renderLinksInHashRouter([77]);
    await clickLink(0);
    await act(async () => {
      navigateInApp?.('/biz/catalog');
    });
    await act(async () => {
      navigateInApp?.('/biz/thread/current');
    });
    await settle(() => resolution.resolve(createTarget(77)));

    expect(getRenderedPathname()).toBe('/biz/thread/current');
  });

  it('does not navigate when the page that showed the clicked quote was left and opened again', async () => {
    const resolution = createDeferred<ReturnType<typeof createTarget>>();
    testState.resolveExternalQuoteTargetMock.mockReturnValue(resolution.promise);

    // Like a thread page, the link exists only while its page is open.
    await act(async () => {
      root.render(
        createElement(
          HashRouter,
          {},
          createElement(
            Routes,
            {},
            createElement(Route, { path: '/biz/thread/current', element: createElement(ExternalNumberQuoteLink, { reference: createReference(77) }) }),
            createElement(Route, { path: '*', element: null }),
          ),
          createElement(LocationProbe),
        ),
      );
    });
    await clickLink(0);
    await act(async () => {
      navigateInApp?.('/biz/catalog');
    });
    expect(container.querySelector('a')).toBeNull();
    await act(async () => {
      navigateInApp?.(-1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(getRenderedPathname()).toBe('/biz/thread/current');
    await settle(() => resolution.resolve(createTarget(77)));

    expect(getRenderedPathname()).toBe('/biz/thread/current');
  });

  it('still navigates when the clicked link is replaced on the same page before its quote resolves', async () => {
    const resolution = createDeferred<ReturnType<typeof createTarget>>();
    testState.resolveExternalQuoteTargetMock.mockReturnValue(resolution.promise);

    await renderLinksInHashRouter([77]);
    await clickLink(0);
    // A same-board quote turns into a regular quote link once the search registers its number.
    await renderLinksInHashRouter([]);
    await settle(() => resolution.resolve(createTarget(77)));

    expect(getRenderedPathname()).toBe('/fit/thread/cid-77');
  });

  it('lets only the latest clicked quote navigate', async () => {
    const resolutions = new Map([
      [77, createDeferred<ReturnType<typeof createTarget>>()],
      [78, createDeferred<ReturnType<typeof createTarget>>()],
    ]);
    testState.resolveExternalQuoteTargetMock.mockImplementation(({ reference }: { reference: { number: number } }) => resolutions.get(reference.number)?.promise);

    await renderLinksInHashRouter([77, 78]);
    await clickLink(0);
    await clickLink(1);
    await settle(() => resolutions.get(77)?.resolve(createTarget(77)));

    expect(getRenderedPathname()).toBe('/biz/thread/current');

    await settle(() => resolutions.get(78)?.resolve(createTarget(78)));

    expect(getRenderedPathname()).toBe('/fit/thread/cid-78');
  });

  it('loads the quoted post for the preview when only its cid is known', async () => {
    const { comment: _comment, ...cidOnlyTarget } = createTarget(77);
    testState.resolveExternalQuoteTargetMock.mockResolvedValue(cidOnlyTarget);
    testState.useCommentMock.mockImplementation(({ commentCid, onlyIfCached }: { commentCid?: string; onlyIfCached?: boolean }) =>
      commentCid === 'cid-77' && !onlyIfCached ? { cid: 'cid-77', number: 77, parentCid: 'cid-1', timestamp: 1, updatedAt: 2 } : undefined,
    );

    await renderLink(77);
    await hoverLink();

    expect(document.body.querySelector('[data-testid="post-preview"]')?.textContent).toBe('cid-77');
  });

  it('keeps a cid-only quote loading until its moderation state arrives', async () => {
    const { comment: _comment, ...cidOnlyTarget } = createTarget(77);
    testState.resolveExternalQuoteTargetMock.mockResolvedValue(cidOnlyTarget);
    // The post itself loads before its CommentUpdate, which is where deleted, removed and purged live.
    let loadedComment: Record<string, unknown> = { cid: 'cid-77', parentCid: 'cid-1', timestamp: 1 };
    testState.useCommentMock.mockImplementation(({ commentCid }: { commentCid?: string }) => (commentCid === 'cid-77' ? loadedComment : undefined));

    await renderLink(77);
    await hoverLink();

    expect(getPreviewText()).toBe('loading_post');
    expect(document.body.querySelector('[data-testid="post-preview"]')).toBeNull();

    loadedComment = { ...loadedComment, number: 77, removed: true, updatedAt: 2 };
    await renderLink(77);

    expect(getPreviewText()).toBe('external_quote_unavailable');
  });

  it('shows the post as loading, not unavailable, until a cid-only quote loads', async () => {
    const { comment: _comment, ...cidOnlyTarget } = createTarget(77);
    testState.resolveExternalQuoteTargetMock.mockResolvedValue(cidOnlyTarget);

    await renderLink(77);
    await hoverLink();

    expect(getPreviewText()).toBe('loading_post');
  });

  it('reports a loaded cid-only quote that was removed as unavailable', async () => {
    const { comment: _comment, ...cidOnlyTarget } = createTarget(77);
    testState.resolveExternalQuoteTargetMock.mockResolvedValue(cidOnlyTarget);
    testState.useCommentMock.mockImplementation(({ commentCid }: { commentCid?: string }) =>
      commentCid === 'cid-77' ? { cid: 'cid-77', number: 77, removed: true, timestamp: 1, updatedAt: 2 } : undefined,
    );

    await renderLink(77);
    await hoverLink();

    expect(getPreviewText()).toBe('external_quote_unavailable');
  });

  it('searches again for a quote that was not found before', async () => {
    testState.resolveExternalQuoteTargetMock.mockResolvedValueOnce(null).mockResolvedValueOnce(createTarget(77));

    await renderLink(77);
    await hoverLink();

    expect(getPreviewText()).toBe('external_quote_cannot_resolve:>>>/fit/77:fit');

    await leaveLink();
    await hoverLink();

    expect(testState.resolveExternalQuoteTargetMock).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-testid="post-preview"]')?.textContent).toBe('cid-77');
  });
});
