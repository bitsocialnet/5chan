import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoThumbnailLinkConversion } from '../use-video-thumbnail-link-conversion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('../../lib/utils/media-utils', () => ({
  getBestAvailableYouTubeThumbnailUrlFromLink: vi.fn(async () => 'https://i.ytimg.com/vi/abc/maxresdefault.jpg'),
  getVimeoThumbnailFileUrlFromLink: vi.fn(async () => undefined),
  getYouTubeThumbnailUrlFromLink: (link: string) => (link.includes('youtube.com') ? 'https://i.ytimg.com/vi/abc/hqdefault.jpg' : undefined),
  isVimeoVideoLink: () => false,
}));

const VIDEO_LINK = 'https://www.youtube.com/watch?v=abc';

let container: HTMLDivElement;
let latestValue: ReturnType<typeof useVideoThumbnailLinkConversion>;
let root: Root;
const onContentChange = vi.fn();
const onLinkChange = vi.fn();
const textRef = { current: null };
const urlRef = { current: null };

const HookHarness = ({ enabled }: { enabled: boolean }) => {
  latestValue = useVideoThumbnailLinkConversion({ enabled, onContentChange, onLinkChange, textRef, urlRef });
  return null;
};

const renderHook = (enabled: boolean) => {
  act(() => {
    root.render(createElement(HookHarness, { enabled }));
  });
};

describe('useVideoThumbnailLinkConversion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('shows a countdown notice for a queued conversion', () => {
    renderHook(true);

    act(() => {
      expect(latestValue.queueLinkConversion(VIDEO_LINK)).toBe(true);
    });

    expect(latestValue.notice).toEqual({ countdown: 3, site: 'youtube' });
  });

  it('cancels a queued conversion when conversion is disabled', () => {
    renderHook(true);
    act(() => {
      latestValue.queueLinkConversion(VIDEO_LINK);
    });

    renderHook(false);
    expect(latestValue.notice).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    renderHook(true);

    expect(latestValue.notice).toBeNull();
    expect(onLinkChange).not.toHaveBeenCalled();
  });
});
