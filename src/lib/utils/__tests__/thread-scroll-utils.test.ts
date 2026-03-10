import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThreadScrollSpacer, openThreadAtTop } from '../thread-scroll-utils';

const appendThreadContainer = (cid: string, top = 240) => {
  const element = document.createElement('div');
  element.dataset.threadContainerCid = cid;
  element.getBoundingClientRect = () =>
    ({
      bottom: top + 100,
      height: 100,
      left: 0,
      right: 100,
      top,
      width: 100,
    }) as DOMRect;
  document.body.appendChild(element);
  return element;
};

describe('thread-scroll-utils', () => {
  let scrollToMock: ReturnType<typeof vi.fn>;
  let requestAnimationFrameMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    scrollToMock = vi.fn();
    requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
      writable: true,
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrameMock,
      writable: true,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 100,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 200,
      writable: true,
    });
  });

  afterEach(() => {
    clearThreadScrollSpacer();
    document.body.innerHTML = '';
  });

  it('scrolls the current thread without pushing duplicate history entries', () => {
    appendThreadContainer('thread-cid');
    const navigateMock = vi.fn();

    expect(
      openThreadAtTop({
        cid: 'thread-cid',
        currentPathname: '/mu/thread/thread-cid',
        navigate: navigateMock,
        threadRoute: '/mu/thread/thread-cid',
      }),
    ).toBe(true);

    expect(navigateMock).not.toHaveBeenCalled();
    expect(requestAnimationFrameMock).toHaveBeenCalledOnce();
    expect(scrollToMock).toHaveBeenCalledTimes(2);
    expect(scrollToMock).toHaveBeenNthCalledWith(1, {
      behavior: 'auto',
      left: 0,
      top: 240,
    });
  });

  it('navigates to the OP thread before scrolling when the route differs', () => {
    appendThreadContainer('thread-cid');
    const navigateMock = vi.fn();

    expect(
      openThreadAtTop({
        cid: 'thread-cid',
        currentPathname: '/mu/thread/reply-cid',
        navigate: navigateMock,
        threadRoute: '/mu/thread/thread-cid',
      }),
    ).toBe(true);

    expect(navigateMock).toHaveBeenCalledWith('/mu/thread/thread-cid');
    expect(requestAnimationFrameMock).toHaveBeenCalledOnce();
    expect(scrollToMock).toHaveBeenCalledTimes(2);
  });

  it('returns false when the permalink cannot resolve a thread target', () => {
    const navigateMock = vi.fn();

    expect(
      openThreadAtTop({
        cid: undefined,
        currentPathname: '/mu/thread/thread-cid',
        navigate: navigateMock,
        threadRoute: '/mu/thread/thread-cid',
      }),
    ).toBe(false);

    expect(navigateMock).not.toHaveBeenCalled();
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalled();
  });
});
