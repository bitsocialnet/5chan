import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useThreadLiveUpdatesStore, { THREAD_REPLIES_SETTLE_MS, THREAD_UPDATE_TIMEOUT_MS } from '../use-thread-live-updates-store';

const getState = () => useThreadLiveUpdatesStore.getState();

const setPageScrollable = (scrollable: boolean) => {
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: scrollable ? 3000 : 500 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true });
};

const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
};

// Lets the refresh promise chain settle without advancing fake timers.
const flushPromises = async () => {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
};

const openThreadWithRefresh = (refresh = vi.fn(async () => true)) => {
  getState().openThread('thread-1');
  getState().setRefreshThread(refresh);
  return refresh;
};

// Runs a countdown to zero and resolves its refresh, leaving the update collecting replies.
const runCountdownToUpdate = async (seconds: number) => {
  await vi.advanceTimersByTimeAsync(seconds * 1000);
  await flushPromises();
};

const settleUpdate = async () => {
  await vi.advanceTimersByTimeAsync(THREAD_REPLIES_SETTLE_MS);
};

describe('useThreadLiveUpdatesStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    setPageScrollable(true);
    setDocumentHidden(false);
    getState().resetState();
  });

  afterEach(() => {
    getState().resetState();
    vi.useRealTimers();
  });

  it('counts down from 10 when Auto is checked, then updates', async () => {
    const refresh = openThreadWithRefresh();

    getState().setEnabled(true);
    expect(getState().status).toEqual({ type: 'countdown', seconds: 10 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(getState().status).toEqual({ type: 'countdown', seconds: 9 });

    await vi.advanceTimersByTimeAsync(8000);
    expect(getState().status).toEqual({ type: 'countdown', seconds: 1 });
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(getState().status).toEqual({ type: 'updating' });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ force: false });
  });

  it('updates on time after a hidden tab throttles the countdown timers', async () => {
    const refresh = openThreadWithRefresh();
    getState().setEnabled(true);

    // A throttled tab can sleep through many one-second ticks and wake once a minute.
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(getState().status).toEqual({ type: 'updating' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores Auto until a thread is open, then retries while the thread cannot refresh yet', async () => {
    getState().setEnabled(true);
    expect(getState()).toMatchObject({ enabled: false, status: { type: 'idle' } });

    getState().openThread('thread-1');
    getState().setEnabled(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getState()).toMatchObject({ status: { type: 'countdown', seconds: 10 }, updatesStarted: 0 });

    const refresh = vi.fn(async () => true);
    getState().setRefreshThread(refresh);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('waits one step longer after each empty update and returns to 10 after new posts', async () => {
    openThreadWithRefresh();
    getState().setEnabled(true);

    await runCountdownToUpdate(10);
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 15 });

    await runCountdownToUpdate(15);
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 20 });

    await runCountdownToUpdate(20);
    getState().recordNewReplies({ count: 2, lastReadReplyCid: 'reply-4', quotesOwnPost: false });
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 10 });
  });

  it('stops escalating at five minutes', async () => {
    openThreadWithRefresh();
    getState().setEnabled(true);

    for (const seconds of [10, 15, 20, 30, 60, 90, 120, 180, 240, 300]) {
      await runCountdownToUpdate(seconds);
      await settleUpdate();
    }

    expect(getState().status).toEqual({ type: 'countdown', seconds: 300 });
  });

  it('reports a manual update result without marking replies unread', async () => {
    const refresh = openThreadWithRefresh();

    getState().forceUpdate();
    expect(getState().status).toEqual({ type: 'updating' });
    expect(refresh).toHaveBeenCalledWith({ force: true });
    await flushPromises();
    getState().recordNewReplies({ count: 1, lastReadReplyCid: 'reply-2', quotesOwnPost: true });
    getState().recordNewReplies({ count: 2, lastReadReplyCid: 'reply-3', quotesOwnPost: false });
    await settleUpdate();

    expect(getState()).toMatchObject({
      faviconAlert: undefined,
      isUpdating: false,
      status: { type: 'new-posts', count: 3 },
      unreadCount: 0,
      unreadMarkerCid: undefined,
    });

    getState().forceUpdate();
    await flushPromises();
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'no-new-posts' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores Update while an update is already running', async () => {
    let resolveRefresh: (value: boolean) => void = () => undefined;
    const refresh = openThreadWithRefresh(vi.fn(() => new Promise<boolean>((resolve) => (resolveRefresh = resolve))));

    getState().forceUpdate();
    getState().forceUpdate();
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh(true);
    await flushPromises();
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'no-new-posts' });
  });

  it('marks automatic updates unread and clears them at the bottom of the thread', async () => {
    openThreadWithRefresh();
    getState().setEnabled(true);

    await runCountdownToUpdate(10);
    getState().recordNewReplies({ count: 3, lastReadReplyCid: 'reply-5', quotesOwnPost: false });
    await settleUpdate();
    expect(getState()).toMatchObject({ faviconAlert: 'new-posts', unreadCount: 3, unreadMarkerCid: 'reply-5' });

    await runCountdownToUpdate(10);
    getState().recordNewReplies({ count: 1, lastReadReplyCid: 'reply-8', quotesOwnPost: true });
    await settleUpdate();
    expect(getState()).toMatchObject({ faviconAlert: 'new-replies', unreadCount: 4, unreadMarkerCid: 'reply-5' });

    await runCountdownToUpdate(10);
    getState().recordNewReplies({ count: 1, lastReadReplyCid: 'reply-9', quotesOwnPost: false });
    await settleUpdate();
    expect(getState()).toMatchObject({ faviconAlert: 'new-replies', unreadCount: 5 });

    getState().clearUnread();
    expect(getState()).toMatchObject({ faviconAlert: undefined, unreadCount: 0, unreadMarkerCid: undefined });
  });

  it('shows the new post count as status when the thread does not scroll', async () => {
    setPageScrollable(false);
    openThreadWithRefresh();
    getState().setEnabled(true);

    await runCountdownToUpdate(10);
    getState().recordNewReplies({ count: 2, lastReadReplyCid: 'reply-1', quotesOwnPost: false });
    expect(getState().status).toEqual({ type: 'new-posts', count: 2 });
    expect(getState().unreadCount).toBe(0);

    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 10 });
  });

  it('shows a connection error when the refresh fails or never settles', async () => {
    openThreadWithRefresh(vi.fn(async () => false));
    getState().forceUpdate();
    await flushPromises();
    expect(getState()).toMatchObject({ isUpdating: false, status: { type: 'error', reason: 'connection' } });

    getState().setRefreshThread(vi.fn(() => new Promise<boolean>(() => undefined)));
    getState().forceUpdate();
    await vi.advanceTimersByTimeAsync(THREAD_UPDATE_TIMEOUT_MS - 1);
    expect(getState().status).toEqual({ type: 'updating' });
    await vi.advanceTimersByTimeAsync(1);
    expect(getState()).toMatchObject({ isUpdating: false, status: { type: 'error', reason: 'connection' } });
  });

  it('polls a hidden tab no faster than once a minute', async () => {
    openThreadWithRefresh();
    getState().setEnabled(true);

    setDocumentHidden(true);
    getState().handleVisibilityChange();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 10 });

    await runCountdownToUpdate(10);
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 90 });

    await runCountdownToUpdate(90);
    getState().recordNewReplies({ count: 1, lastReadReplyCid: 'reply-1', quotesOwnPost: false });
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 60 });

    setDocumentHidden(false);
    getState().handleVisibilityChange();
    await runCountdownToUpdate(10);
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 15 });
  });

  it('returns a late reply batch to the first delay', async () => {
    openThreadWithRefresh();
    getState().setEnabled(true);

    await runCountdownToUpdate(10);
    await settleUpdate();
    expect(getState().status).toEqual({ type: 'countdown', seconds: 15 });

    getState().recordNewReplies({ count: 1, lastReadReplyCid: 'reply-1', quotesOwnPost: false });
    expect(getState().status).toEqual({ type: 'countdown', seconds: 10 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(getState().status).toEqual({ type: 'countdown', seconds: 9 });
  });

  it('keeps Auto per thread for the browser session', () => {
    openThreadWithRefresh();
    getState().setEnabled(true);
    expect(sessionStorage.getItem('5chan-thread-auto-update:thread-1')).toBe('1');

    getState().openThread('thread-2');
    expect(getState()).toMatchObject({ enabled: false, status: { type: 'idle' }, threadCid: 'thread-2' });

    getState().openThread('thread-1');
    expect(getState()).toMatchObject({ enabled: true, status: { type: 'countdown', seconds: 10 } });

    getState().setEnabled(false);
    expect(sessionStorage.getItem('5chan-thread-auto-update:thread-1')).toBeNull();
    expect(getState().status).toEqual({ type: 'idle' });
  });

  it('keeps showing the running update when Auto is unchecked mid-update', async () => {
    let resolveRefresh: (value: boolean) => void = () => undefined;
    openThreadWithRefresh(vi.fn(() => new Promise<boolean>((resolve) => (resolveRefresh = resolve))));
    getState().setEnabled(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getState().status).toEqual({ type: 'updating' });

    getState().setEnabled(false);
    expect(getState().status).toEqual({ type: 'updating' });

    resolveRefresh(true);
    await flushPromises();
    await settleUpdate();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getState().status).toEqual({ type: 'no-new-posts' });
  });

  it('ignores an update result that lands after the thread changed', async () => {
    let resolveRefresh: (value: boolean) => void = () => undefined;
    openThreadWithRefresh(vi.fn(() => new Promise<boolean>((resolve) => (resolveRefresh = resolve))));
    getState().forceUpdate();

    getState().openThread('thread-2');
    resolveRefresh(false);
    await flushPromises();
    await settleUpdate();

    expect(getState()).toMatchObject({ isUpdating: false, status: { type: 'idle' }, threadCid: 'thread-2' });
  });

  it('stops for good when the open thread dies, and explains itself when asked', async () => {
    const refresh = openThreadWithRefresh();
    getState().setEnabled(true);

    getState().markThreadDead('archived', true);
    expect(getState()).toMatchObject({
      deadReason: 'archived',
      enabled: false,
      faviconAlert: 'dead',
      status: { type: 'error', reason: 'archived' },
    });
    expect(sessionStorage.getItem('5chan-thread-auto-update:thread-1')).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    getState().setEnabled(true);
    getState().clearUnread();
    expect(getState()).toMatchObject({ enabled: false, faviconAlert: 'dead' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps an already archived thread quiet until Update is clicked', () => {
    const refresh = openThreadWithRefresh();

    getState().markThreadDead('deleted', false);
    expect(getState()).toMatchObject({ faviconAlert: undefined, status: { type: 'idle' } });

    getState().forceUpdate();
    expect(getState().status).toEqual({ type: 'error', reason: 'deleted' });
    expect(refresh).not.toHaveBeenCalled();
  });
});
