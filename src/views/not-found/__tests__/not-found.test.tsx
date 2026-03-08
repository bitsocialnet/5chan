import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotFound from '../not-found';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  directories: [{ address: 'music-posting.eth', title: '/mu/ - Music' }] as Array<{ address: string; title?: string }>,
  location: {
    pathname: '/mu/thread/missing-post',
  },
  resolvedAddress: 'music-posting.eth',
  shortAddress: 'mu',
  subplebbitAddress: 'music-posting.eth',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => createElement('a', { href: to }, children),
    useLocation: () => testState.location,
  };
});

vi.mock('../../../hooks/use-stable-subplebbit', () => ({
  useSubplebbitField: (_address: string, selector: (subplebbit: { address?: string; shortAddress?: string }) => string | undefined) =>
    selector({
      address: testState.resolvedAddress,
      shortAddress: testState.shortAddress,
    }),
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
}));

vi.mock('../../../lib/utils/route-utils', () => ({
  getSubplebbitAddress: () => testState.subplebbitAddress,
}));

vi.mock('../../home', () => ({
  HomeLogo: () => createElement('div', { 'data-testid': 'home-logo' }, 'home-logo'),
}));

vi.mock('../../../components/not-found-image', () => ({
  default: () => createElement('div', { 'data-testid': 'not-found-image' }, 'image'),
}));

let container: HTMLDivElement;
let root: Root;

const renderNotFound = async () => {
  await act(async () => {
    root.render(createElement(NotFound));
  });
};

describe('NotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.directories = [{ address: 'music-posting.eth', title: '/mu/ - Music' }];
    testState.location = {
      pathname: '/mu/thread/missing-post',
    };
    testState.resolvedAddress = 'music-posting.eth';
    testState.shortAddress = 'mu';
    testState.subplebbitAddress = 'music-posting.eth';

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the board-specific back link when the missing route belongs to a known board', async () => {
    await renderNotFound();

    expect(container.querySelector('[data-testid="home-logo"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="not-found-image"]')).toBeTruthy();
    expect(container.textContent).toContain('Not Found');
    expect(container.textContent).toContain('Back to p/mu');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/mu');
  });

  it('omits the board link for generic not-found routes', async () => {
    testState.location = {
      pathname: '/not-found',
    };
    testState.resolvedAddress = '';
    testState.shortAddress = '';
    testState.subplebbitAddress = '';

    await renderNotFound();

    expect(container.textContent).not.toContain('Back to p/');
    expect(container.querySelector('a')).toBeNull();
  });
});
