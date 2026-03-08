import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentMediaInfo } from '../../lib/utils/media-utils';
import { useCommentMediaInfo } from '../use-comment-media-info';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  fetchWebpageThumbnailIfNeededMock: vi.fn<(mediaInfo: CommentMediaInfo) => Promise<CommentMediaInfo>>(),
  getCommentMediaInfoMock: vi.fn<(link: string, thumbnailUrl: string, linkWidth: number, linkHeight: number) => CommentMediaInfo | undefined>(),
  imageHeight: 360,
  imageWidth: 640,
  mediaInfo: undefined as CommentMediaInfo | undefined,
  params: {} as Record<string, string>,
  pathname: '/all',
  thumbnailMediaInfo: undefined as CommentMediaInfo | undefined,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: testState.pathname }),
    useParams: () => testState.params,
  };
});

vi.mock('../../lib/utils/media-utils', () => ({
  fetchWebpageThumbnailIfNeeded: (mediaInfo: CommentMediaInfo) => testState.fetchWebpageThumbnailIfNeededMock(mediaInfo),
  getCommentMediaInfo: (link: string, thumbnailUrl: string, linkWidth: number, linkHeight: number) =>
    testState.getCommentMediaInfoMock(link, thumbnailUrl, linkWidth, linkHeight),
}));

let latestValue: CommentMediaInfo | undefined;
let container: HTMLDivElement;
let root: Root;
let originalImage: typeof globalThis.Image;

class MockImage {
  height = testState.imageHeight;
  onerror: ((this: GlobalEventHandlers, ev: Event | string) => any) | null = null;
  onload: ((this: GlobalEventHandlers, ev: Event) => any) | null = null;
  width = testState.imageWidth;

  set src(_value: string) {
    setTimeout(() => {
      this.onload?.call(this as never, new Event('load'));
    }, 0);
  }
}

const HookHarness = ({ link, linkHeight, linkWidth, thumbnailUrl }: { link: string; linkHeight: number; linkWidth: number; thumbnailUrl: string }) => {
  latestValue = useCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  return null;
};

const flushEffects = async (count = 5) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderHook = async (props = { link: 'https://example.com', linkHeight: 360, linkWidth: 640, thumbnailUrl: '' }) => {
  await act(async () => {
    root.render(createElement(HookHarness, props));
  });
  await flushEffects();
};

describe('useCommentMediaInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestValue = undefined;
    testState.imageHeight = 360;
    testState.imageWidth = 640;
    testState.mediaInfo = undefined;
    testState.params = {};
    testState.pathname = '/all';
    testState.thumbnailMediaInfo = undefined;
    testState.getCommentMediaInfoMock.mockImplementation(() => testState.mediaInfo);
    testState.fetchWebpageThumbnailIfNeededMock.mockImplementation(async () => testState.thumbnailMediaInfo ?? (testState.mediaInfo as CommentMediaInfo));

    originalImage = globalThis.Image;
    globalThis.Image = MockImage as never;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.Image = originalImage;
  });

  it('returns the current media info without fetching thumbnails outside post and pending views', async () => {
    testState.mediaInfo = {
      thumbnail: 'https://cdn.example.com/thumb.jpg',
      type: 'image',
      url: 'https://cdn.example.com/image.jpg',
    };

    await renderHook({
      link: 'https://cdn.example.com/image.jpg',
      linkHeight: 360,
      linkWidth: 640,
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
    });

    expect(latestValue).toEqual(testState.mediaInfo);
    expect(testState.fetchWebpageThumbnailIfNeededMock).not.toHaveBeenCalled();
  });

  it('fetches webpage thumbnails on thread routes and stores the loaded dimensions', async () => {
    testState.pathname = '/biz/thread/post-1';
    testState.params = {
      boardIdentifier: 'biz',
      commentCid: 'post-1',
    };
    testState.mediaInfo = {
      type: 'webpage',
      url: 'https://example.com',
    };
    testState.thumbnailMediaInfo = {
      ...testState.mediaInfo,
      thumbnail: 'https://cdn.example.com/thumb.jpg',
    };

    await renderHook({
      link: 'https://example.com',
      linkHeight: 360,
      linkWidth: 640,
      thumbnailUrl: '',
    });

    expect(testState.fetchWebpageThumbnailIfNeededMock).toHaveBeenCalledWith(testState.mediaInfo);
    expect(latestValue).toMatchObject({
      thumbnailHeight: 360,
      thumbnailWidth: 640,
      type: 'webpage',
      url: 'https://example.com',
    });
  });

  it('skips webpage thumbnail fetching when the route is pending but a thumbnail already exists', async () => {
    testState.pathname = '/pending/42';
    testState.params = {
      accountCommentIndex: '42',
    };
    testState.mediaInfo = {
      thumbnail: 'https://cdn.example.com/existing-thumb.jpg',
      type: 'webpage',
      url: 'https://example.com/already-thumbnailed',
    };

    await renderHook({
      link: 'https://example.com/already-thumbnailed',
      linkHeight: 360,
      linkWidth: 640,
      thumbnailUrl: 'https://cdn.example.com/existing-thumb.jpg',
    });

    expect(latestValue).toEqual(testState.mediaInfo);
    expect(testState.fetchWebpageThumbnailIfNeededMock).not.toHaveBeenCalled();
  });
});
