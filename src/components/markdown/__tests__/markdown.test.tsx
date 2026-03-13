import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Markdown from '../markdown';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type TestComment = {
  cid?: string;
  number?: number;
};

const testState = vi.hoisted(() => ({
  comments: {} as Record<string, TestComment>,
  embeddableHosts: new Set<string>(),
  internalPathByHref: {} as Record<string, string | null>,
  isMobile: false,
  mediaInfoByHref: {} as Record<string, { thumbnail?: string; type: string; url: string }>,
  numberToCid: {} as Record<string, Record<number, string>>,
  unavailableCids: new Set<string>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@floating-ui/react', () => ({
  FloatingPortal: ({ children }: { children?: React.ReactNode }) => createElement(React.Fragment, {}, children),
  autoUpdate: () => undefined,
  offset: () => ({}),
  shift: () => ({}),
  size: () => ({}),
  useDismiss: () => ({}),
  useFloating: () => ({
    context: {},
    floatingStyles: {},
    refs: {
      setFloating: () => undefined,
      setReference: () => undefined,
    },
    update: () => undefined,
  }),
  useFocus: () => ({}),
  useHover: () => ({}),
  useInteractions: () => ({
    getFloatingProps: (props?: Record<string, unknown>) => props || {},
    getReferenceProps: (props?: Record<string, unknown>) => props || {},
  }),
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useComment: ({ commentCid }: { commentCid?: string }) => (commentCid ? testState.comments[commentCid] : undefined),
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks/dist/stores/communities-pages', () => ({
  default: (selector: (state: { comments: typeof testState.comments }) => unknown) =>
    selector({
      comments: testState.comments,
    }),
}));

vi.mock('../../../hooks/use-is-mobile', () => ({
  default: () => testState.isMobile,
}));

vi.mock('../../../lib/utils/media-utils', () => ({
  getHasThumbnail: (linkMediaInfo?: { thumbnail?: string; type?: string }, href?: string) =>
    Boolean(linkMediaInfo?.thumbnail || linkMediaInfo?.type === 'image' || (href && testState.mediaInfoByHref[href]?.thumbnail)),
  getLinkMediaInfo: (href: string) => testState.mediaInfoByHref[href],
}));

vi.mock('../../../lib/utils/quote-link-utils', () => ({
  isUnavailableQuoteTarget: (comment?: TestComment) => Boolean(comment?.cid && testState.unavailableCids.has(comment.cid)),
}));

vi.mock('../../../lib/utils/view-utils', () => ({
  isCatalogView: (pathname: string) => pathname.includes('/catalog'),
}));

vi.mock('../../../lib/utils/url-utils', () => ({
  is5chanLink: (href: string) => href in testState.internalPathByHref,
  isValidCrossboardPattern: (pattern: string) => pattern.startsWith('>>>/'),
  transform5chanLinkToInternal: (href: string) => testState.internalPathByHref[href] ?? null,
}));

vi.mock('../../../stores/use-post-number-store', () => ({
  default: (selector: (state: { numberToCid: typeof testState.numberToCid }) => unknown) =>
    selector({
      numberToCid: testState.numberToCid,
    }),
}));

vi.mock('../../comment-media', () => ({
  default: ({ commentMediaInfo }: { commentMediaInfo?: { type?: string; url?: string } }) =>
    createElement('div', { 'data-testid': 'comment-media' }, `${commentMediaInfo?.type}:${commentMediaInfo?.url}`),
}));

vi.mock('../../embed', () => ({
  canEmbed: (parsedUrl: URL) => testState.embeddableHosts.has(parsedUrl.host),
}));

vi.mock('../../reply-quote-preview', () => ({
  default: ({
    isOP,
    isQuotelinkUnavailable,
    quotelinkNumber,
    quotelinkReply,
  }: {
    isOP?: boolean;
    isQuotelinkUnavailable?: boolean;
    quotelinkNumber?: number;
    quotelinkReply?: TestComment;
  }) =>
    createElement(
      'span',
      {
        'data-number': String(quotelinkNumber ?? ''),
        'data-op': String(Boolean(isOP)),
        'data-testid': 'reply-quote-preview',
        'data-unavailable': String(Boolean(isQuotelinkUnavailable)),
      },
      quotelinkReply?.cid || 'missing',
    ),
}));

vi.mock('../external-number-quote-link', () => ({
  default: ({ reference }: { reference: { raw: string } }) => createElement('a', { 'data-testid': 'external-number-quote-link', href: '#' }, reference.raw),
}));

let container: HTMLDivElement;
let root: Root;

const renderMarkdown = async (props: { content: string; postCid?: string; communityAddress?: string; title?: string }, initialEntry = '/mu/thread/post-1') => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [initialEntry] }, createElement(Markdown, props)));
  });
};

describe('Markdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.comments = {};
    testState.embeddableHosts = new Set<string>();
    testState.internalPathByHref = {};
    testState.isMobile = false;
    testState.mediaInfoByHref = {};
    testState.numberToCid = {};
    testState.unavailableCids = new Set<string>();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders catalog prefixes, greentext, spoilers, and cross-board/internal links', async () => {
    testState.internalPathByHref = {
      'https://5chan.local/p/mu': '/mu',
    };

    await renderMarkdown(
      {
        content: '>green line\n[spoiler]spoiled[/spoiler] >>>/fit/ https://5chan.local/p/mu',
        title: 'Subject',
      },
      '/mu/catalog',
    );

    expect(container.textContent).toContain('Subject:');
    expect(container.querySelector('.greentext')?.textContent).toContain('>green line');
    expect(container.querySelector('.spoilertext')?.textContent).toBe('spoiled');

    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expect.arrayContaining(['/fit', '/mu']));
    expect(links.find((link) => link.getAttribute('href') === '/fit')?.textContent).toBe('>>>/fit/');
  });

  it('renders number quote links with op and unavailable state derived from cached comments', async () => {
    testState.comments = {
      'comment-42': { cid: 'comment-42', number: 42 },
    };
    testState.numberToCid = {
      'music-posting.eth': {
        42: 'comment-42',
      },
    };
    testState.unavailableCids = new Set(['comment-42']);

    await renderMarkdown({
      content: '>>42',
      postCid: 'comment-42',
      communityAddress: 'music-posting.eth',
    });

    const quotePreview = container.querySelector('[data-testid="reply-quote-preview"]');
    expect(quotePreview?.getAttribute('data-number')).toBe('42');
    expect(quotePreview?.getAttribute('data-op')).toBe('true');
    expect(quotePreview?.getAttribute('data-unavailable')).toBe('true');
    expect(quotePreview?.textContent).toBe('comment-42');
  });

  it('renders lazy same-board and cross-board number quotes when the cid is not cached', async () => {
    await renderMarkdown({
      content: '>>42 >>>/fit/77',
      communityAddress: 'music-posting.eth',
    });

    const lazyLinks = Array.from(container.querySelectorAll('[data-testid="external-number-quote-link"]'));
    expect(lazyLinks.map((node) => node.textContent)).toEqual(['>>42', '>>>/fit/77']);
  });

  it('toggles inline media embeds for embeddable links outside catalog view', async () => {
    testState.mediaInfoByHref = {
      'https://cdn.example/image.png': {
        thumbnail: 'https://cdn.example/thumb.png',
        type: 'image',
        url: 'https://cdn.example/image.png',
      },
    };

    await renderMarkdown({
      content: 'https://cdn.example/image.png',
    });

    const toggle = Array.from(container.querySelectorAll('span')).find((node) => node.textContent === 'embed');
    expect(toggle).toBeTruthy();
    expect(container.querySelector('[data-testid="comment-media"]')).toBeNull();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="comment-media"]')?.textContent).toBe('image:https://cdn.example/image.png');

    const removeToggle = Array.from(container.querySelectorAll('span')).find((node) => node.textContent === 'remove');
    await act(async () => {
      removeToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="comment-media"]')).toBeNull();
  });
});
