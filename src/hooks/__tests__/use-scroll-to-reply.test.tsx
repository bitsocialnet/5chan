import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { VirtuosoHandle } from 'react-virtuoso';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useScrollToReply from '../use-scroll-to-reply';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

const testState = vi.hoisted(() => ({
  loadMoreMock: vi.fn(),
  scrollToIndexMock: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

const HookHarness = ({
  enabled = true,
  hasMore,
  replies,
  targetReplyCid,
}: {
  enabled?: boolean;
  hasMore: boolean;
  replies: Array<{ cid?: string | null }>;
  targetReplyCid?: string;
}) => {
  useScrollToReply({
    enabled,
    hasMore,
    loadMore: testState.loadMoreMock,
    replies,
    targetReplyCid,
    virtuosoRef: {
      current: {
        scrollToIndex: testState.scrollToIndexMock,
      } as unknown as VirtuosoHandle,
    } as React.RefObject<VirtuosoHandle | null>,
  });

  return null;
};

const renderHook = async (props: { enabled?: boolean; hasMore: boolean; replies: Array<{ cid?: string | null }>; targetReplyCid?: string }) => {
  await act(async () => {
    root.render(createElement(HookHarness, props));
  });
};

describe('useScrollToReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.querySelectorAll('[data-cid]').forEach((node) => node.remove());
    vi.useRealTimers();
  });

  it('scrolls directly to the target reply when it is already loaded', async () => {
    await renderHook({
      hasMore: true,
      replies: [{ cid: 'reply-1' }, { cid: 'reply-2' }],
      targetReplyCid: 'reply-2',
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(testState.scrollToIndexMock).toHaveBeenCalledWith({
      align: 'center',
      behavior: 'smooth',
      index: 1,
    });
    expect(testState.loadMoreMock).not.toHaveBeenCalled();
  });

  it('scrolls to the latest loaded reply and schedules loadMore while searching', async () => {
    await renderHook({
      hasMore: true,
      replies: [{ cid: 'reply-1' }, { cid: 'reply-2' }],
      targetReplyCid: 'reply-3',
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(testState.scrollToIndexMock).toHaveBeenCalledWith({
      align: 'end',
      behavior: 'smooth',
      index: 1,
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(testState.loadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('uses DOM scrolling once all replies are loaded and the target element exists', async () => {
    const replyElement = document.createElement('div');
    const scrollIntoViewMock = vi.fn();
    replyElement.dataset.cid = 'reply-3';
    replyElement.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(replyElement);

    await renderHook({
      hasMore: false,
      replies: [{ cid: 'reply-1' }],
      targetReplyCid: 'reply-3',
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
    expect(testState.scrollToIndexMock).not.toHaveBeenCalled();
  });

  it('warns once the target reply cannot be found after all pages are loaded', async () => {
    await renderHook({
      hasMore: false,
      replies: [{ cid: 'reply-1' }],
      targetReplyCid: 'reply-404',
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(warnSpy).toHaveBeenCalledWith('[scroll-to-reply] Could not find reply with CID "reply-404" in the feed.');
    expect(testState.loadMoreMock).not.toHaveBeenCalled();
  });
});
