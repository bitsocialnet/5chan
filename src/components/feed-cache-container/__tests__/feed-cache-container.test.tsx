import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useFeedCacheStore from '../../../stores/use-feed-cache-store';
import FeedCacheContainer from '../feed-cache-container';
import { FeedCacheContext } from '../../../hooks/use-feed-cache-context';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = {
  activeSubscriptions: new Set<string>(),
  subscribeMock: vi.fn(),
};

const MockCatalog = ({ feedCacheKey }: { feedCacheKey: string }) => {
  React.useEffect(() => {
    testState.activeSubscriptions.add(feedCacheKey);
    return () => {
      testState.activeSubscriptions.delete(feedCacheKey);
    };
  }, [feedCacheKey]);
  return createElement('div', { 'data-testid': 'catalog' });
};

const MockBoard = ({ feedCacheKey }: { feedCacheKey: string }) => {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    testState.subscribeMock(feedCacheKey);
    testState.activeSubscriptions.add(feedCacheKey);
    return () => {
      testState.activeSubscriptions.delete(feedCacheKey);
    };
  }, [feedCacheKey]);
  return createElement(
    'div',
    { 'data-testid': `board-${feedCacheKey}`, 'data-cached-feed': React.useContext(FeedCacheContext) },
    createElement('button', { 'data-testid': `counter-${feedCacheKey}`, onClick: () => setCount((value) => value + 1) }, String(count)),
    feedCacheKey === '/a'
      ? createElement(
          React.Fragment,
          {},
          createElement('video', { 'data-testid': 'cached-video', src: 'https://cdn.example.com/video.mp4' }),
          createElement('iframe', { 'data-testid': 'cached-iframe', src: 'https://player.example.com/embed', title: 'remote embed' }),
          createElement('iframe', { 'data-testid': 'cached-srcdoc-iframe', srcDoc: '<p>srcdoc embed</p>', title: 'srcdoc embed' }),
        )
      : null,
  );
};

const renderFeedCacheContainer = () => createElement(FeedCacheContainer, { boardView: MockBoard, catalogView: MockCatalog });

let container: HTMLDivElement;
let iframeRectSpy: ReturnType<typeof vi.spyOn>;
let latestPathname = '';
let pauseSpy: ReturnType<typeof vi.spyOn>;
let root: Root;

const NavigateButtons = () => {
  const navigate = useNavigate();
  return createElement(
    React.Fragment,
    {},
    createElement('button', { 'data-testid': 'navigate-a', onClick: () => navigate('/a'), type: 'button' }, 'a'),
    createElement('button', { 'data-testid': 'navigate-b', onClick: () => navigate('/b'), type: 'button' }, 'b'),
    createElement('button', { 'data-testid': 'navigate-thread', onClick: () => navigate('/a/thread/post'), type: 'button' }, 'thread'),
    createElement('button', { 'data-testid': 'navigate-settings', onClick: () => navigate('/a/settings?example=1'), type: 'button' }, 'settings'),
    createElement('button', { 'data-testid': 'navigate-back', onClick: () => navigate(-1), type: 'button' }, 'back'),
  );
};

const LocationProbe = () => {
  latestPathname = useLocation().pathname;
  return null;
};

const flushEffects = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('FeedCacheContainer', () => {
  beforeEach(() => {
    useFeedCacheStore.getState().clearFeeds();
    testState.activeSubscriptions.clear();
    testState.subscribeMock.mockClear();
    iframeRectSpy = vi.spyOn(window.HTMLIFrameElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 240,
      height: 240,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => '',
    });
    pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    latestPathname = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useFeedCacheStore.getState().clearFeeds();
    iframeRectSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it('mounts a missing feed in the first route commit before updating the persisted cache', async () => {
    const commits: Array<{ pathname: string; hasFeed: boolean; persistedKeys: string[] }> = [];
    const CommitProbe = () => {
      const { pathname } = useLocation();
      React.useLayoutEffect(() => {
        commits.push({
          pathname,
          hasFeed: Boolean(container.querySelector(`[data-testid="board-${pathname}"]`)),
          persistedKeys: useFeedCacheStore.getState().cachedFeeds.map((feed) => feed.key),
        });
      }, [pathname]);
      return null;
    };
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ['/a'] }, renderFeedCacheContainer(), createElement(NavigateButtons), createElement(CommitProbe)));
    });
    expect(commits[0]).toEqual({ pathname: '/a', hasFeed: true, persistedKeys: [] });

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-b"]')?.click());
    expect(commits.find((commit) => commit.pathname === '/b')).toEqual({ pathname: '/b', hasFeed: true, persistedKeys: ['/a'] });
    expect(useFeedCacheStore.getState().cachedFeeds.every((feed) => Number.isFinite(feed.lastAccessed))).toBe(true);
  });

  it('disconnects inactive board subscriptions while retaining DOM and local state across thread, board and settings navigation', async () => {
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ['/a'] }, renderFeedCacheContainer(), createElement(NavigateButtons)));
    });
    const board = container.querySelector('[data-testid="board-/a"]');
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="counter-/a"]')?.click());
    expect(testState.activeSubscriptions).toEqual(new Set(['/a']));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-thread"]')?.click());
    expect(testState.activeSubscriptions.size).toBe(0);
    expect(container.querySelector('[data-testid="board-/a"]')).toBe(board);

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-back"]')?.click());
    expect(testState.activeSubscriptions).toEqual(new Set(['/a']));
    expect(container.querySelector('[data-testid="counter-/a"]')?.textContent).toBe('1');

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-b"]')?.click());
    expect(testState.activeSubscriptions).toEqual(new Set(['/b']));

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-settings"]')?.click());
    expect(testState.activeSubscriptions).toEqual(new Set(['/a']));
    expect(container.querySelector('[data-testid="board-/a"]')).toBe(board);
    expect(container.querySelector('[data-testid="counter-/a"]')?.textContent).toBe('1');
    const subscriptionsBeforeClosingSettings = testState.subscribeMock.mock.calls.length;

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-a"]')?.click());
    expect(testState.subscribeMock).toHaveBeenCalledTimes(subscriptionsBeforeClosingSettings);
  });

  it('preserves the existing hidden catalog subscription lifecycle', async () => {
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ['/a/catalog'] }, renderFeedCacheContainer(), createElement(NavigateButtons)));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="navigate-b"]')?.click());
    expect(testState.activeSubscriptions).toEqual(new Set(['/a/catalog', '/b']));
  });

  it('suspends playable media while a cached feed is hidden and restores iframe embeds when visible again', async () => {
    await act(async () => {
      root.render(createElement(MemoryRouter, { initialEntries: ['/a'] }, renderFeedCacheContainer(), createElement(NavigateButtons), createElement(LocationProbe)));
    });
    await flushEffects();

    expect(latestPathname).toBe('/a');
    expect(container.querySelector('[data-testid="board-/a"]')?.getAttribute('data-cached-feed')).toBe('true');
    expect(container.querySelector<HTMLVideoElement>('[data-testid="cached-video"]')).toBeTruthy();
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="cached-iframe"]')?.getAttribute('src')).toBe('https://player.example.com/embed');
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="cached-srcdoc-iframe"]')?.getAttribute('srcdoc')).toBe('<p>srcdoc embed</p>');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="navigate-b"]')?.click();
    });
    await flushEffects();

    expect(latestPathname).toBe('/b');
    expect(container.querySelector('[data-testid="board-/a"]')?.getAttribute('data-cached-feed')).toBe('true');
    expect(pauseSpy).toHaveBeenCalled();
    expect(container.querySelector<HTMLVideoElement>('[data-testid="cached-video"]')).toBeTruthy();
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="cached-iframe"]')?.getAttribute('src')).toBe('about:blank');
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="cached-srcdoc-iframe"]')?.getAttribute('srcdoc')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="navigate-a"]')?.click();
    });
    await flushEffects();

    expect(latestPathname).toBe('/a');
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="cached-iframe"]')?.getAttribute('src')).toBe('https://player.example.com/embed');
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="cached-srcdoc-iframe"]')?.getAttribute('srcdoc')).toBe('<p>srcdoc embed</p>');
  });
});
