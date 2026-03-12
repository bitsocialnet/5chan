import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExternalNumberQuoteLink from '../external-number-quote-link';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  resolveExternalQuoteTargetMock: vi.fn(),
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

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useAccount: () => ({ id: 'account-1' }),
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
      setErrorStatus: vi.fn(),
      setLoadingStatus: vi.fn(),
    }),
}));

vi.mock('../../loading-ellipsis', () => ({
  default: ({ string }: { string: string }) => createElement('div', { 'data-testid': 'loading-ellipsis' }, string),
}));

vi.mock('../../../views/post', () => ({
  Post: ({ post }: { post?: { cid?: string } }) => createElement('div', { 'data-testid': 'post-preview' }, post?.cid || 'missing-post'),
}));

let container: HTMLDivElement;
let root: Root;

describe('ExternalNumberQuoteLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      subplebbitAddress: 'fit',
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
});
