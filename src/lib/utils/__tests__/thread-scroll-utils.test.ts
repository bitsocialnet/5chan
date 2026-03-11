import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestedThreadTopCid, getThreadTopNavigationState, scrollThreadContainerToTop } from '../thread-scroll-utils';

const appendThreadContainer = ({ cid, top = 240, hidden = false, parent = document.body }: { cid: string; top?: number; hidden?: boolean; parent?: HTMLElement }) => {
  const element = document.createElement('div');
  element.dataset.threadContainerCid = cid;
  if (hidden) {
    element.style.display = 'none';
  }
  element.getBoundingClientRect = () =>
    ({
      bottom: top + 100,
      height: 100,
      left: 0,
      right: 100,
      top,
      width: 100,
    }) as DOMRect;
  parent.appendChild(element);
  return element;
};

describe('thread-scroll-utils', () => {
  let scrollToMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    scrollToMock = vi.fn();

    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
      writable: true,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 32,
      writable: true,
    });

    document.body.innerHTML = '';
  });

  it('scrolls the matching thread container with a plain window scroll', () => {
    appendThreadContainer({ cid: 'thread-cid', top: 240 });

    expect(scrollThreadContainerToTop('thread-cid')).toBe(true);

    expect(scrollToMock).toHaveBeenCalledOnce();
    expect(scrollToMock).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 0,
      top: 272,
    });
  });

  it('ignores preview copies when resolving the scroll target', () => {
    const previewWrapper = document.createElement('div');
    previewWrapper.dataset.threadScrollPreview = 'true';
    document.body.appendChild(previewWrapper);
    appendThreadContainer({ cid: 'thread-cid', top: 12, parent: previewWrapper });
    appendThreadContainer({ cid: 'thread-cid', top: 180 });

    expect(scrollThreadContainerToTop('thread-cid')).toBe(true);

    expect(scrollToMock).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 0,
      top: 212,
    });
  });

  it('prefers the visible thread container when cached duplicates are hidden', () => {
    appendThreadContainer({ cid: 'thread-cid', top: 12, hidden: true });
    appendThreadContainer({ cid: 'thread-cid', top: 180 });

    expect(scrollThreadContainerToTop('thread-cid')).toBe(true);

    expect(scrollToMock).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 0,
      top: 212,
    });
  });

  it('returns false when no thread container exists', () => {
    expect(scrollThreadContainerToTop('missing-cid')).toBe(false);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it('serializes and reads thread-top navigation state', () => {
    expect(getThreadTopNavigationState('thread-cid')).toEqual({
      scrollThreadContainerCid: 'thread-cid',
    });
    expect(getRequestedThreadTopCid({ scrollThreadContainerCid: 'thread-cid' })).toBe('thread-cid');
    expect(getRequestedThreadTopCid({ scrollThreadContainerCid: 42 })).toBeUndefined();
    expect(getRequestedThreadTopCid(null)).toBeUndefined();
  });
});
