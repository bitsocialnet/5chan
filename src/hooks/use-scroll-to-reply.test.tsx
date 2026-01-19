/* @vitest-environment jsdom */
import { act, useMemo } from 'react';
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { VirtuosoHandle } from 'react-virtuoso';
import useScrollToReply from './use-scroll-to-reply';

const TestHarness = ({
  targetReplyCid,
  replies,
  hasMore,
  loadMore,
  virtuosoRef,
  renderTargetElement = false,
}: {
  targetReplyCid?: string;
  replies: Array<{ cid?: string | null }>;
  hasMore: boolean;
  loadMore: () => void;
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  renderTargetElement?: boolean;
}) => {
  const memoizedReplies = useMemo(() => replies, [replies]);
  useScrollToReply({
    targetReplyCid,
    replies: memoizedReplies,
    hasMore,
    loadMore,
    virtuosoRef,
    enabled: true,
  });

  return renderTargetElement ? <div data-cid={targetReplyCid} /> : null;
};

describe('useScrollToReply', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('scrolls to target reply index when present', async () => {
    const scrollToIndex = vi.fn();
    const virtuosoRef = { current: { scrollToIndex } as unknown as VirtuosoHandle };
    const replies = [{ cid: 'a' }, { cid: 'b' }, { cid: 'c' }];

    await act(() => {
      root.render(<TestHarness targetReplyCid='b' replies={replies} hasMore={true} loadMore={vi.fn()} virtuosoRef={virtuosoRef} />);
    });

    await act(() => Promise.resolve());

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(scrollToIndex).toHaveBeenCalledWith({
      index: 1,
      align: 'center',
      behavior: 'smooth',
    });
  });

  it('loads more when target reply is not yet present', async () => {
    const loadMore = vi.fn();
    const virtuosoRef = { current: { scrollToIndex: vi.fn() } as unknown as VirtuosoHandle };
    let intervalCallback: (() => void) | null = null;
    let timeoutCallback: (() => void) | null = null;

    vi.spyOn(window, 'setInterval').mockImplementation((callback) => {
      intervalCallback = callback as () => void;
      return 1;
    });

    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      timeoutCallback = callback as () => void;
      return 1;
    });

    await act(() => {
      root.render(<TestHarness targetReplyCid='missing' replies={[{ cid: 'a' }]} hasMore={true} loadMore={loadMore} virtuosoRef={virtuosoRef} />);
    });

    await act(() => Promise.resolve());

    act(() => {
      intervalCallback?.();
    });

    act(() => {
      timeoutCallback?.();
    });

    expect(loadMore).toHaveBeenCalled();
  });

  it('scrolls into view when virtualization is not active', async () => {
    const loadMore = vi.fn();
    const virtuosoRef = { current: { scrollToIndex: vi.fn() } as unknown as VirtuosoHandle };

    await act(() => {
      root.render(
        <TestHarness targetReplyCid='target' replies={[{ cid: 'target' }]} hasMore={false} loadMore={loadMore} virtuosoRef={virtuosoRef} renderTargetElement={true} />,
      );
    });

    await act(() => Promise.resolve());

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
