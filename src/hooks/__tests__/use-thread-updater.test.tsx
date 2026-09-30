import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useThreadUpdater from '../use-thread-updater';
import useThreadLiveUpdatesStore from '../../stores/use-thread-live-updates-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('../../lib/bitsocial-internals/stores', () => ({
  accountsStore: { getState: () => ({ commentCidsToAccountsComments: {} }) },
}));

let container: HTMLDivElement;
let root: Root;
const refreshThread = vi.fn(async () => true);

const Harness = ({ post }: { post: Comment | undefined }) => {
  useThreadUpdater({ post, refreshThread });
  return null;
};

const render = async (post: Comment | undefined) => {
  await act(async () => {
    root.render(createElement(Harness, { post }));
  });
};

const livePost = { cid: 'thread-1', replyCount: 3, updatedAt: 100 } as Comment;

const scrollTo = (scrollY: number) => {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY, writable: true });
  window.dispatchEvent(new Event('scroll'));
};

describe('useThreadUpdater', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useThreadLiveUpdatesStore.getState().resetState();
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useThreadLiveUpdatesStore.getState().resetState();
  });

  it('opens the thread, shares its post, and resets on unmount', async () => {
    await render(livePost);
    expect(useThreadLiveUpdatesStore.getState()).toMatchObject({ threadCid: 'thread-1', threadPost: livePost });

    useThreadLiveUpdatesStore.getState().forceUpdate();
    expect(refreshThread).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(useThreadLiveUpdatesStore.getState()).toMatchObject({ threadCid: undefined, threadPost: undefined, status: { type: 'idle' } });
    root = createRoot(container);
  });

  it('announces a thread that dies while open', async () => {
    await render(livePost);
    await render({ ...livePost, archived: true, updatedAt: 200 } as Comment);

    expect(useThreadLiveUpdatesStore.getState()).toMatchObject({
      deadReason: 'archived',
      faviconAlert: 'dead',
      status: { type: 'error', reason: 'archived' },
    });
  });

  it('keeps a thread that was already archived quiet', async () => {
    await render({ cid: 'thread-1' } as Comment);
    await render({ ...livePost, archived: true } as Comment);

    expect(useThreadLiveUpdatesStore.getState()).toMatchObject({ deadReason: 'archived', faviconAlert: undefined, status: { type: 'idle' } });
  });

  it('marks everything read when the viewer reaches the bottom', async () => {
    await render(livePost);
    useThreadLiveUpdatesStore.getState().setEnabled(true);
    useThreadLiveUpdatesStore.setState({ faviconAlert: 'new-posts', unreadCount: 2, unreadMarkerCid: 'reply-1' });

    scrollTo(1000);
    expect(useThreadLiveUpdatesStore.getState().unreadCount).toBe(2);

    scrollTo(2200);
    expect(useThreadLiveUpdatesStore.getState()).toMatchObject({ faviconAlert: undefined, unreadCount: 0, unreadMarkerCid: undefined });
  });
});
