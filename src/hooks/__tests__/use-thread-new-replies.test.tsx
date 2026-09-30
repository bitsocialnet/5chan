import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useThreadNewReplies from '../use-thread-new-replies';
import useThreadLiveUpdatesStore from '../../stores/use-thread-live-updates-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  syncThreadRepliesFeedsMock: vi.fn(),
}));

vi.mock('../../lib/utils/thread-refresh-cache-utils', () => ({
  syncThreadRepliesFeeds: testState.syncThreadRepliesFeedsMock,
}));

vi.mock('../../lib/bitsocial-internals/stores', () => ({
  accountsStore: {
    getState: () => ({ commentCidsToAccountsComments: { mine: {} } }),
  },
}));

type HarnessProps = { enabled?: boolean; hasMore?: boolean; post: Comment; replies: Comment[] };

let container: HTMLDivElement;
let root: Root;
let markerCid: string | undefined;
const recordNewRepliesMock = vi.fn();

const Harness = ({ enabled = true, hasMore = false, post, replies }: HarnessProps) => {
  markerCid = useThreadNewReplies({ enabled, hasMore, post, replies });
  return null;
};

const render = async (props: HarnessProps) => {
  await act(async () => {
    root.render(createElement(Harness, props));
  });
};

const reply = (cid: string, fields: Partial<Comment> = {}) => ({ cid, parentCid: 'op', postCid: 'op', ...fields }) as Comment;
const post = { cid: 'op', number: 1, replyCount: 2, updatedAt: 100 } as Comment;
const startUpdate = () => useThreadLiveUpdatesStore.setState({ updatesStarted: 1 });

describe('useThreadNewReplies', () => {
  beforeEach(() => {
    testState.syncThreadRepliesFeedsMock.mockReset();
    recordNewRepliesMock.mockReset();
    useThreadLiveUpdatesStore.getState().resetState();
    useThreadLiveUpdatesStore.setState({ recordNewReplies: recordNewRepliesMock });
    markerCid = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useThreadLiveUpdatesStore.getState().resetState();
  });

  it('treats replies shown before the first update as read', async () => {
    await render({ post, replies: [reply('a'), reply('b')] });
    await render({ post, replies: [reply('a'), reply('b'), reply('c')] });

    expect(recordNewRepliesMock).not.toHaveBeenCalled();
  });

  it('reports replies that appear after an update, below the last reply read', async () => {
    await render({ post, replies: [reply('a'), reply('b')] });
    startUpdate();
    await render({ post, replies: [reply('a'), reply('b'), reply('c'), reply('mine'), reply('d', { content: 'hi' })] });

    expect(recordNewRepliesMock).toHaveBeenCalledTimes(1);
    expect(recordNewRepliesMock).toHaveBeenCalledWith({ count: 2, lastReadReplyCid: 'b', quotesOwnPost: false });

    await render({ post, replies: [reply('a'), reply('b'), reply('c'), reply('mine', { number: 5 }), reply('d'), reply('e', { content: '>>5' })] });
    expect(recordNewRepliesMock).toHaveBeenLastCalledWith({ count: 1, lastReadReplyCid: 'd', quotesOwnPost: true });
  });

  it('waits for the loaded replies before taking the read baseline', async () => {
    startUpdate();
    await render({ post, replies: [] });
    await render({ post, replies: [reply('a'), reply('b')] });
    expect(recordNewRepliesMock).not.toHaveBeenCalled();

    await render({ post, replies: [reply('a'), reply('b'), reply('c')] });
    expect(recordNewRepliesMock).toHaveBeenCalledWith({ count: 1, lastReadReplyCid: 'b', quotesOwnPost: false });
  });

  it('reports the first reply to an empty thread without a marker position', async () => {
    const emptyPost = { ...post, replyCount: 0 } as Comment;
    await render({ post: emptyPost, replies: [] });
    startUpdate();
    await render({ post: emptyPost, replies: [reply('a')] });

    expect(recordNewRepliesMock).toHaveBeenCalledWith({ count: 1, lastReadReplyCid: undefined, quotesOwnPost: false });
  });

  it('ignores replies loaded by pagination, including the last page', async () => {
    await render({ hasMore: true, post, replies: [reply('a'), reply('b')] });
    startUpdate();
    await render({ hasMore: true, post, replies: [reply('a'), reply('b'), reply('c')] });
    await render({ hasMore: false, post, replies: [reply('a'), reply('b'), reply('c'), reply('d')] });
    expect(recordNewRepliesMock).not.toHaveBeenCalled();

    await render({ hasMore: false, post, replies: [reply('a'), reply('b'), reply('c'), reply('d'), reply('e')] });
    expect(recordNewRepliesMock).toHaveBeenCalledWith({ count: 1, lastReadReplyCid: 'd', quotesOwnPost: false });
  });

  it('recomputes the replies feed when the thread post updates', async () => {
    await render({ post, replies: [reply('a')] });
    expect(testState.syncThreadRepliesFeedsMock).toHaveBeenCalledTimes(1);

    await render({ post: { ...post }, replies: [reply('a')] });
    expect(testState.syncThreadRepliesFeedsMock).toHaveBeenCalledTimes(1);

    await render({ post: { ...post, updatedAt: 200 } as Comment, replies: [reply('a')] });
    expect(testState.syncThreadRepliesFeedsMock).toHaveBeenCalledTimes(2);
  });

  it('returns the unread marker only on the thread page', async () => {
    useThreadLiveUpdatesStore.setState({ unreadMarkerCid: 'b' });

    await render({ post, replies: [reply('a'), reply('b')] });
    expect(markerCid).toBe('b');

    await render({ enabled: false, post, replies: [reply('a'), reply('b')] });
    expect(markerCid).toBeUndefined();
    expect(testState.syncThreadRepliesFeedsMock).toHaveBeenCalledTimes(1);
  });
});
