import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  cachedThumbnails: new Map<string, string>(),
  canEmbedHosts: new Set<string>(),
  capacitorHttpGetMock: vi.fn(),
  capacitorHttpRequestMock: vi.fn(),
  consoleErrorMock: vi.fn(),
  fetchMock: vi.fn(),
  isNativePlatform: false,
  localForageGetItemMock: vi.fn(),
  localForageSetItemMock: vi.fn(),
}));

vi.mock('@bitsocial/bitsocial-react-hooks/dist/lib/localforage-lru/index.js', () => ({
  default: {
    createInstance: () => ({
      getItem: (url: string) => testState.localForageGetItemMock(url),
      setItem: (url: string, thumbnail: string) => testState.localForageSetItemMock(url, thumbnail),
    }),
  },
}));

vi.mock('../embed-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../embed-utils')>();
  return {
    ...actual,
    canEmbed: (url: URL) => testState.canEmbedHosts.has(url.hostname),
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => testState.isNativePlatform,
  },
  CapacitorHttp: {
    get: (options: unknown) => testState.capacitorHttpGetMock(options),
    request: (options: unknown) => testState.capacitorHttpRequestMock(options),
  },
}));

import {
  getBestAvailableYouTubeThumbnailUrlFromLink,
  fetchMediaFileSize,
  fetchWebpageThumbnailIfNeeded,
  formatFileSize,
  getCommentMediaInfo,
  getDisplayMediaInfoType,
  getHasThumbnail,
  getLinkMediaInfo,
  getMediaDimensions,
  getMobileFileSizeLabel,
  getPostMediaTypeLabel,
  getTwimgMediaFilePublishUrl,
  getVimeoThumbnailFileUrlFromLink,
  getVimeoThumbnailLookupUrl,
  getVimeoThumbnailUrlSnapshot,
  getYouTubeEmbedPostMediaFileLink,
  getYouTubeThumbnailCandidateUrlsFromLink,
  getYouTubeThumbnailFallbackUrls,
  getYouTubeThumbnailUrlFromLink,
  isMissingYouTubeThumbnailImage,
  subscribeVimeoThumbnailUrl,
} from '../media-utils';

const clearMemoizedCache = (fn: unknown) => {
  const memoized = fn as { clear?: () => void };
  memoized.clear?.();
};

const createFetchResponse = (html: string, ok = true) => {
  let sent = false;

  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) {
            return { done: true, value: undefined };
          }

          sent = true;
          return {
            done: false,
            value: new TextEncoder().encode(html),
          };
        },
      }),
    },
    ok,
  };
};

const createHeadResponse = (ok: boolean, contentLength = '12345') => ({
  headers: {
    get: (name: string) => (name.toLowerCase() === 'content-length' ? contentLength : null),
  },
  ok,
});

const createNativeHeadResponse = (status: number, contentLength = '12345') => ({
  headers: {
    'Content-Length': contentLength,
  },
  status,
});

const getFileSizeReads = () => testState.fetchMock.mock.calls.map(([, options]) => `${(options as RequestInit).method ?? 'GET'} ${(options as RequestInit).cache}`);

describe('media-utils', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    testState.cachedThumbnails = new Map<string, string>();
    testState.canEmbedHosts = new Set<string>();
    testState.isNativePlatform = false;
    testState.localForageGetItemMock.mockImplementation(async (url: string) => testState.cachedThumbnails.get(url) ?? null);
    testState.localForageSetItemMock.mockImplementation(async (url: string, thumbnail: string) => {
      testState.cachedThumbnails.set(url, thumbnail);
    });
    testState.fetchMock.mockReset();
    testState.capacitorHttpGetMock.mockReset();
    testState.capacitorHttpRequestMock.mockReset();
    vi.stubGlobal('fetch', testState.fetchMock);
    clearMemoizedCache(getHasThumbnail);
    clearMemoizedCache(getLinkMediaInfo);
    clearMemoizedCache(getMediaDimensions);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(testState.consoleErrorMock);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('maps media types to translated labels', () => {
    const t = (key: string) => `translated:${key}`;

    expect(getDisplayMediaInfoType('image', t)).toBe('translated:image');
    expect(getDisplayMediaInfoType('gif', t)).toBe('translated:gif');
    expect(getDisplayMediaInfoType('animated gif', t)).toBe('translated:animated_gif');
    expect(getDisplayMediaInfoType('iframe', t)).toBe('translated:iframe');
    expect(getDisplayMediaInfoType('video', t)).toBe('translated:video');
    expect(getDisplayMediaInfoType('audio', t)).toBe('translated:audio');
    expect(getDisplayMediaInfoType('swf', t)).toBe('SWF');
    expect(getDisplayMediaInfoType('unknown', t)).toBe('translated:webpage');
  });

  it('uses the youtube thumbnail url for post media file links and labels', () => {
    const mediaInfo = {
      patternThumbnailUrl: 'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
      type: 'iframe',
      url: 'https://www.youtube.com/watch?v=abc123',
    };

    expect(getYouTubeEmbedPostMediaFileLink(mediaInfo)).toBe('https://img.youtube.com/vi/abc123/maxresdefault.jpg');
    expect(getPostMediaTypeLabel(mediaInfo, 'iframe', (key) => key)).toBe('youtube_video');
    expect(getYouTubeEmbedPostMediaFileLink({ type: 'iframe', url: 'https://streamable.com/clip123' })).toBeUndefined();
    expect(getYouTubeThumbnailUrlFromLink('https://youtu.be/short123')).toBe('https://img.youtube.com/vi/short123/maxresdefault.jpg');
    expect(getYouTubeThumbnailUrlFromLink('https://example.com/watch?v=not-youtube')).toBeUndefined();
  });

  it('builds youtube thumbnail candidates and detects the served missing-thumbnail placeholder', () => {
    expect(getYouTubeThumbnailCandidateUrlsFromLink('https://www.youtube.com/watch?v=abc123')).toEqual([
      'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
      'https://img.youtube.com/vi/abc123/sddefault.jpg',
      'https://img.youtube.com/vi/abc123/mqdefault.jpg',
      'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    ]);
    expect(getYouTubeThumbnailFallbackUrls('https://i3.ytimg.com/vi/abc123/maxresdefault.jpg')).toEqual([
      'https://i3.ytimg.com/vi/abc123/maxresdefault.jpg',
      'https://img.youtube.com/vi/abc123/sddefault.jpg',
      'https://img.youtube.com/vi/abc123/mqdefault.jpg',
      'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    ]);
    expect(getYouTubeThumbnailFallbackUrls('https://i3.ytimg.com/vi/abc123/sddefault.jpg')).toEqual([
      'https://i3.ytimg.com/vi/abc123/sddefault.jpg',
      'https://img.youtube.com/vi/abc123/mqdefault.jpg',
      'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    ]);
    expect(isMissingYouTubeThumbnailImage('https://i3.ytimg.com/vi/abc123/maxresdefault.jpg', 120, 90)).toBe(true);
    expect(isMissingYouTubeThumbnailImage('https://i3.ytimg.com/vi/abc123/maxresdefault.jpg', 1280, 720)).toBe(false);
    expect(isMissingYouTubeThumbnailImage('https://example.com/thumb.jpg', 120, 90)).toBe(false);
  });

  it('resolves the best available youtube thumbnail without accepting the failed placeholder response', async () => {
    testState.fetchMock
      .mockResolvedValueOnce(createHeadResponse(false, '1097'))
      .mockResolvedValueOnce(createHeadResponse(true, '1097'))
      .mockResolvedValueOnce(createHeadResponse(true, '8710'));

    await expect(getBestAvailableYouTubeThumbnailUrlFromLink('https://www.youtube.com/watch?v=resolve123')).resolves.toBe(
      'https://img.youtube.com/vi/resolve123/mqdefault.jpg',
    );
    expect(testState.fetchMock).toHaveBeenNthCalledWith(1, 'https://img.youtube.com/vi/resolve123/maxresdefault.jpg', expect.objectContaining({ method: 'HEAD' }));
    expect(testState.fetchMock).toHaveBeenNthCalledWith(2, 'https://img.youtube.com/vi/resolve123/sddefault.jpg', expect.objectContaining({ method: 'HEAD' }));
    expect(testState.fetchMock).toHaveBeenNthCalledWith(3, 'https://img.youtube.com/vi/resolve123/mqdefault.jpg', expect.objectContaining({ method: 'HEAD' }));
  });

  it('uses native http requests when resolving youtube thumbnails in native builds', async () => {
    testState.isNativePlatform = true;
    testState.capacitorHttpRequestMock.mockResolvedValueOnce(createNativeHeadResponse(404, '1097')).mockResolvedValueOnce(createNativeHeadResponse(200, '8765'));

    await expect(getBestAvailableYouTubeThumbnailUrlFromLink('https://www.youtube.com/watch?v=native123')).resolves.toBe(
      'https://img.youtube.com/vi/native123/sddefault.jpg',
    );
    expect(testState.fetchMock).not.toHaveBeenCalled();
    expect(testState.capacitorHttpRequestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        connectTimeout: 3000,
        method: 'HEAD',
        readTimeout: 3000,
        url: 'https://img.youtube.com/vi/native123/maxresdefault.jpg',
      }),
    );
    expect(testState.capacitorHttpRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'HEAD',
        url: 'https://img.youtube.com/vi/native123/sddefault.jpg',
      }),
    );
  });

  it('returns no youtube thumbnail when every candidate is unavailable', async () => {
    testState.fetchMock.mockResolvedValue(createHeadResponse(false, '1097'));

    await expect(getBestAvailableYouTubeThumbnailUrlFromLink('https://www.youtube.com/watch?v=missing123')).resolves.toBeUndefined();
  });

  it('recognizes which media types expose thumbnails', () => {
    expect(getHasThumbnail(undefined, 'https://example.com/file.png')).toBe(false);
    expect(getHasThumbnail({ type: 'image', url: 'https://example.com/file.png' }, 'https://example.com/file.png')).toBe(true);
    expect(getHasThumbnail({ type: 'video', url: 'https://example.com/file.mp4' }, 'https://example.com/file.mp4')).toBe(true);
    expect(getHasThumbnail({ type: 'audio', url: 'https://example.com/file.mp3' }, 'https://example.com/file.mp3')).toBe(true);
    expect(getHasThumbnail({ type: 'gif', url: 'https://example.com/file.gif' }, 'https://example.com/file.gif')).toBe(true);
    expect(getHasThumbnail({ type: 'swf', url: 'https://example.com/file.swf' }, 'https://example.com/file.swf')).toBe(true);
    expect(getHasThumbnail({ thumbnail: 'https://example.com/thumb.png', type: 'webpage', url: 'https://example.com' }, 'https://example.com')).toBe(true);
    expect(
      getHasThumbnail(
        { patternThumbnailUrl: 'https://img.youtube.com/vi/abc/maxresdefault.jpg', type: 'iframe', url: 'https://www.youtube.com/watch?v=abc' },
        'https://www.youtube.com/watch?v=abc',
      ),
    ).toBe(true);
    expect(getHasThumbnail({ type: 'iframe', url: 'https://example.com/embed' }, 'https://example.com/embed')).toBe(false);
  });

  it('classifies direct media, embeds, imgbb pages, and unknown links', () => {
    testState.canEmbedHosts = new Set(['www.youtube.com', 'streamable.com']);

    expect(getLinkMediaInfo('not-a-url')).toBeUndefined();
    expect(getLinkMediaInfo('https://example.com/_next/image?url=%2Fposter.png')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://ibb.co/abc123')).toEqual({
      thumbnail: 'https://i.ibb.co/abc123/thumbnail.jpg',
      type: 'webpage',
      url: 'https://ibb.co/abc123',
    });
    expect(getLinkMediaInfo('https://example.com/file.gif')).toMatchObject({ type: 'gif' });
    expect(getLinkMediaInfo('https://external-preview.redd.it/example.gif?width=480&format=mp4')).toMatchObject({ type: 'video' });
    expect(getLinkMediaInfo('https://example.com/file.jfif')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://example.com/file.jpe')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://example.com/file.jif')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://example.com/file.png')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://example.com/file.apng')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://example.com/file.avif')).toMatchObject({ type: 'image' });
    expect(getLinkMediaInfo('https://example.com/file.mp4')).toMatchObject({ type: 'video' });
    expect(getLinkMediaInfo('https://example.com/file.mp3')).toMatchObject({ type: 'audio' });
    expect(getLinkMediaInfo('https://example.com/file.swf')).toMatchObject({ type: 'swf' });
    expect(getLinkMediaInfo('https://example.com/path')).toMatchObject({ type: 'webpage' });
    expect(getLinkMediaInfo('https://www.youtube.com/watch?v=abc123')).toEqual({
      patternThumbnailUrl: 'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
      type: 'iframe',
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(getLinkMediaInfo('https://streamable.com/clip123')).toEqual({
      patternThumbnailUrl: 'https://cdn-cf-east.streamable.com/image/clip123.jpg',
      type: 'iframe',
      url: 'https://streamable.com/clip123',
    });
    expect(getLinkMediaInfo('https://yt.example/watch?v=yt123')).toEqual({
      patternThumbnailUrl: 'https://img.youtube.com/vi/yt123/maxresdefault.jpg',
      type: 'iframe',
      url: 'https://yt.example/watch?v=yt123',
    });
    testState.canEmbedHosts = new Set(['yewtu.be']);
    expect(getLinkMediaInfo('https://yewtu.be/invidious123')).toEqual({
      patternThumbnailUrl: 'https://img.youtube.com/vi/invidious123/maxresdefault.jpg',
      type: 'iframe',
      url: 'https://yewtu.be/invidious123',
    });
  });

  it('normalizes known twimg query-format media links for publishing', () => {
    expect(getTwimgMediaFilePublishUrl('https://pbs.twimg.com/media/HJxnhNKWMAAhqFU?format=jpg&name=medium')).toBe('https://pbs.twimg.com/media/HJxnhNKWMAAhqFU.jpg');
    expect(getTwimgMediaFilePublishUrl('http://pbs.twimg.com/media/HJxnhNKWMAAhqFU?format=PNG&name=small')).toBe('https://pbs.twimg.com/media/HJxnhNKWMAAhqFU.png');
    expect(getTwimgMediaFilePublishUrl('https://pbs.twimg.com/media/HJxnhNKWMAAhqFU.jpg?format=png&name=medium')).toBeUndefined();
    expect(getTwimgMediaFilePublishUrl('https://example.com/media/HJxnhNKWMAAhqFU?format=jpg&name=medium')).toBeUndefined();
    expect(getTwimgMediaFilePublishUrl('https://pbs.twimg.com/media/HJxnhNKWMAAhqFU?format=txt&name=medium')).toBeUndefined();
  });

  it('builds comment media info and strips thumbnails for blacklisted domains', () => {
    testState.canEmbedHosts = new Set(['www.youtube.com']);

    expect(getCommentMediaInfo('', '', 0, 0)).toBeUndefined();
    expect(getCommentMediaInfo('https://example.com/file.png', 'https://example.com/thumb.png', 320, 240)).toEqual({
      linkHeight: 240,
      linkWidth: 320,
      thumbnail: 'https://example.com/thumb.png',
      type: 'image',
      url: 'https://example.com/file.png',
    });
    expect(getCommentMediaInfo('https://example.com/file.png', 'http://127.0.0.1/thumb.png', 320, 240)).toEqual({
      linkHeight: 240,
      linkWidth: 320,
      thumbnail: undefined,
      type: 'image',
      url: 'https://example.com/file.png',
    });
    expect(getCommentMediaInfo('https://example.com/post', '//192.168.1.1/thumb.png', 320, 240)).toEqual({
      linkHeight: 240,
      linkWidth: 320,
      thumbnail: undefined,
      type: 'webpage',
      url: 'https://example.com/post',
    });
    expect(getCommentMediaInfo('https://x.com/post/123', 'https://example.com/thumb.png', 100, 50)).toEqual({
      linkHeight: 50,
      linkWidth: 100,
      patternThumbnailUrl: undefined,
      thumbnail: undefined,
      type: 'webpage',
      url: 'https://x.com/post/123',
    });
    expect(getCommentMediaInfo('https://www.youtube.com/watch?v=abc123', '', 800, 450)).toEqual({
      linkHeight: 450,
      linkWidth: 800,
      patternThumbnailUrl: 'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
      thumbnail: undefined,
      type: 'iframe',
      url: 'https://www.youtube.com/watch?v=abc123',
    });
  });

  it('returns expected media dimensions for embeds, audio, and sized media', () => {
    testState.canEmbedHosts = new Set(['www.youtube.com', 'www.reddit.com', 'vimeo.com']);

    expect(getMediaDimensions({ type: 'iframe', url: 'https://www.youtube.com/watch?v=abc123' })).toBe('800x450');
    expect(getMediaDimensions({ type: 'iframe', url: 'https://vimeo.com/22439234' })).toBe('800x450');
    expect(getMediaDimensions({ type: 'iframe', url: 'https://www.reddit.com/r/example/comments/abc123' })).toBe('500x520');
    expect(getMediaDimensions({ type: 'audio', url: 'https://example.com/file.mp3' })).toBe('700x240');
    expect(getMediaDimensions({ linkHeight: 480, linkWidth: 640, type: 'image', url: 'https://example.com/file.png' })).toBe('640x480');
    expect(getMediaDimensions({ linkHeight: 720, linkWidth: 1280, type: 'video', url: 'https://example.com/file.mp4' })).toBe('1280x720');
    expect(getMediaDimensions({ linkHeight: 480, linkWidth: 640, type: 'swf', url: 'https://example.com/file.swf' })).toBe('640x480');
    expect(getMediaDimensions({ type: 'webpage', url: 'https://example.com' })).toBe('');
  });

  it('formats file sizes with the same rounding as 4chan file rows', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1024 B');
    expect(formatFileSize(1025)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('2 KB');
    expect(formatFileSize(19125)).toBe('19 KB');
    expect(formatFileSize(1048575)).toBe('1024 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
    expect(formatFileSize(1234567)).toBe('1.18 MB');
  });

  it('builds the 4chan mobile caption only when the file size and extension are known', () => {
    expect(getMobileFileSizeLabel('https://files.catbox.moe/v0zbnp.jpeg', 19125)).toBe('19 KB JPEG');
    expect(getMobileFileSizeLabel('https://cdn.example.com/media?format=webm', 2097152)).toBe('2 MB WEBM');
    expect(getMobileFileSizeLabel('https://cdn.example.com/media', 19125)).toBeUndefined();
    expect(getMobileFileSizeLabel('https://files.catbox.moe/v0zbnp.jpeg', undefined)).toBeUndefined();
  });

  it('reads the size with HEAD where the host supports it', async () => {
    testState.fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '111067' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '2048' } }));

    await expect(fetchMediaFileSize('https://head.example.com/thinking.jpg')).resolves.toBe(111067);
    await expect(fetchMediaFileSize('https://head.example.com/brock.webp')).resolves.toBe(2048);

    expect(getFileSizeReads()).toEqual(['HEAD no-store', 'HEAD no-store']);
  });

  it('falls back to a cacheable GET when HEAD is blocked, then skips HEAD for that host', async () => {
    testState.fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '19125' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '4096' } }));

    await expect(fetchMediaFileSize('https://files.catbox.moe/v0zbnp.jpeg')).resolves.toBe(19125);
    await expect(fetchMediaFileSize('https://files.catbox.moe/second.jpeg')).resolves.toBe(4096);

    expect(getFileSizeReads()).toEqual(['HEAD no-store', 'GET force-cache', 'GET force-cache']);
    // Only the headers are needed, so the GET body is dropped.
    expect((testState.fetchMock.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('keeps asking a host that answered before when a later read fails', async () => {
    testState.fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '4096' } }))
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'content-length': '8192' } }));

    await expect(fetchMediaFileSize('https://flaky.example.com/first.jpg')).resolves.toBe(4096);
    await expect(fetchMediaFileSize('https://flaky.example.com/second.jpg')).resolves.toBeUndefined();
    await expect(fetchMediaFileSize('https://flaky.example.com/third.jpg')).resolves.toBe(8192);
  });

  it('probes a new host once for concurrent reads and stops asking it when both reads are blocked', async () => {
    testState.fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const fileSizes = await Promise.all(['first', 'second', 'third'].map((name) => fetchMediaFileSize(`https://no-cors.example.com/${name}.jpg`)));
    await expect(fetchMediaFileSize('https://no-cors.example.com/later.jpg')).resolves.toBeUndefined();

    expect(fileSizes).toEqual([undefined, undefined, undefined]);
    expect(testState.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports no media file size when the response omits it', async () => {
    testState.fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(fetchMediaFileSize('https://chunked.example.com/file.jpg')).resolves.toBeUndefined();

    testState.fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 206, headers: { 'content-length': '1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 206, headers: { 'content-length': '1' } }));
    await expect(fetchMediaFileSize('https://partial.example.com/file.mp4')).resolves.toBeUndefined();

    await expect(fetchMediaFileSize('blob:https://5chan.app/local-preview')).resolves.toBeUndefined();
    expect(testState.fetchMock).toHaveBeenCalledTimes(4);
  });

  it('uses cached webpage thumbnails before fetching the network', async () => {
    testState.cachedThumbnails.set('https://example.com/cached', 'https://cdn.example/cached.png');

    const result = await fetchWebpageThumbnailIfNeeded({
      type: 'webpage',
      url: 'https://example.com/cached',
    });

    expect(result).toEqual({
      thumbnail: 'https://cdn.example/cached.png',
      type: 'webpage',
      url: 'https://example.com/cached',
    });
    expect(testState.fetchMock).not.toHaveBeenCalled();
  });

  it('fetches og:image thumbnails on web and persists them', async () => {
    testState.fetchMock.mockResolvedValue(
      createFetchResponse(`
        <html>
          <head><meta property="og:image" content="https://cdn.example/og.png" /></head>
          <body></body>
        </html>
      `),
    );

    const result = await fetchWebpageThumbnailIfNeeded({
      type: 'webpage',
      url: 'https://example.com/og-page',
    });

    expect(testState.fetchMock).toHaveBeenCalledWith('https://example.com/og-page', expect.objectContaining({ headers: { Accept: 'text/html' }, redirect: 'manual' }));
    expect(testState.localForageSetItemMock).toHaveBeenCalledWith('https://example.com/og-page', 'https://cdn.example/og.png');
    expect(result).toEqual({
      thumbnail: 'https://cdn.example/og.png',
      type: 'webpage',
      url: 'https://example.com/og-page',
    });
  });

  it('falls back to the first image when og:image is not allowed', async () => {
    testState.fetchMock.mockResolvedValue(
      createFetchResponse(`
        <html>
          <head><meta property="og:image" content="http://127.0.0.1/og.png" /></head>
          <body><img src="https://cdn.example/fallback.png" /></body>
        </html>
      `),
    );

    const result = await fetchWebpageThumbnailIfNeeded({
      type: 'webpage',
      url: 'https://example.com/fallback-page',
    });

    expect(testState.localForageSetItemMock).toHaveBeenCalledWith('https://example.com/fallback-page', 'https://cdn.example/fallback.png');
    expect(result).toEqual({
      thumbnail: 'https://cdn.example/fallback.png',
      type: 'webpage',
      url: 'https://example.com/fallback-page',
    });
  });

  it('fetches first-image thumbnails on native and resolves relative urls', async () => {
    testState.isNativePlatform = true;
    testState.capacitorHttpGetMock.mockResolvedValue({
      data: `
        <html>
          <body><img src="/poster.png" /></body>
        </html>
      `,
    });

    const result = await fetchWebpageThumbnailIfNeeded({
      type: 'webpage',
      url: 'https://example.com/native-page',
    });

    expect(testState.capacitorHttpGetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectTimeout: 5000,
        disableRedirects: true,
        headers: { Accept: 'text/html', Range: 'bytes=0-1048575' },
        readTimeout: 5000,
        responseType: 'text',
        url: 'https://example.com/native-page',
      }),
    );
    expect(result).toEqual({
      thumbnail: 'https://example.com/poster.png',
      type: 'webpage',
      url: 'https://example.com/native-page',
    });
  });

  it('returns unchanged media when thumbnails already exist or fetching fails', async () => {
    const existing = {
      thumbnail: 'https://cdn.example/existing.png',
      type: 'webpage',
      url: 'https://example.com/ready',
    } as const;
    expect(await fetchWebpageThumbnailIfNeeded(existing)).toBe(existing);

    testState.fetchMock.mockResolvedValue(createFetchResponse('<html></html>', false));
    const result = await fetchWebpageThumbnailIfNeeded({
      type: 'webpage',
      url: 'https://example.com/failure',
    });

    expect(result).toEqual({
      thumbnail: undefined,
      type: 'webpage',
      url: 'https://example.com/failure',
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  describe('vimeo oEmbed thumbnails', () => {
    // Resolved lookups are kept for the session, so each test uses its own video id.
    const resolveVimeoThumbnail = async (vimeoUrl: string) => {
      const listener = vi.fn();
      const unsubscribe = subscribeVimeoThumbnailUrl(vimeoUrl, listener);
      await vi.waitFor(() => expect(listener).toHaveBeenCalled());
      unsubscribe();
      return getVimeoThumbnailUrlSnapshot(vimeoUrl);
    };

    it('looks up thumbnails only for vimeo embeds that have none, keeping unlisted hashes', () => {
      expect(getVimeoThumbnailLookupUrl({ type: 'iframe', url: 'https://www.vimeo.com/channels/staffpicks/22439234' })).toBe('https://vimeo.com/22439234');
      expect(getVimeoThumbnailLookupUrl({ type: 'iframe', url: 'https://player.vimeo.com/video/22439234?h=8272103f6e' })).toBe('https://vimeo.com/22439234/8272103f6e');
      expect(getVimeoThumbnailLookupUrl({ thumbnail: 'https://i.vimeocdn.com/video/1-a-d_640', type: 'iframe', url: 'https://vimeo.com/22439234' })).toBeUndefined();
      expect(getVimeoThumbnailLookupUrl({ type: 'iframe', url: 'https://www.youtube.com/watch?v=abc123' })).toBeUndefined();
      expect(getVimeoThumbnailLookupUrl({ type: 'webpage', url: 'https://vimeo.com/22439234' })).toBeUndefined();
    });

    it('resolves the oEmbed thumbnail once, persists it, and notifies subscribers', async () => {
      const thumbnailUrl = 'https://i.vimeocdn.com/video/145027281-cf3e-d_640?region=us';
      testState.fetchMock.mockResolvedValue({ ok: true, json: async () => ({ thumbnail_url: thumbnailUrl }) });

      expect(await resolveVimeoThumbnail('https://vimeo.com/1001')).toBe(thumbnailUrl);
      expect(testState.fetchMock).toHaveBeenCalledOnce();
      expect(testState.fetchMock).toHaveBeenCalledWith(
        'https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1001&width=640',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      await vi.waitFor(() => expect(testState.localForageSetItemMock).toHaveBeenCalledWith('https://vimeo.com/1001', thumbnailUrl));

      subscribeVimeoThumbnailUrl('https://vimeo.com/1001', vi.fn())();
      expect(testState.fetchMock).toHaveBeenCalledOnce();
    });

    it('uses a persisted thumbnail without calling oEmbed', async () => {
      testState.cachedThumbnails.set('https://vimeo.com/1002', 'https://i.vimeocdn.com/video/cached-d_640');

      expect(await resolveVimeoThumbnail('https://vimeo.com/1002')).toBe('https://i.vimeocdn.com/video/cached-d_640');
      expect(testState.fetchMock).not.toHaveBeenCalled();
    });

    it('treats thumbnails outside the vimeo cdn and missing videos as final answers', async () => {
      testState.fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ thumbnail_url: 'https://evil.example/thumb.jpg' }) });
      expect(await resolveVimeoThumbnail('https://vimeo.com/1003')).toBeUndefined();
      expect(testState.localForageSetItemMock).not.toHaveBeenCalled();

      testState.fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
      expect(await resolveVimeoThumbnail('https://vimeo.com/1004')).toBeUndefined();

      subscribeVimeoThumbnailUrl('https://vimeo.com/1004', vi.fn())();
      expect(testState.fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries network errors and server errors on a later subscribe once the backoff passes', async () => {
      const vimeoUrl = 'https://vimeo.com/1005';
      const thumbnailUrl = 'https://i.vimeocdn.com/video/retry-d_640';
      const subscribeOnce = async () => {
        subscribeVimeoThumbnailUrl(vimeoUrl, listener)();
        await new Promise((resolve) => setTimeout(resolve, 0));
      };
      const listener = vi.fn();
      testState.fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ thumbnail_url: thumbnailUrl }) });
      vi.useFakeTimers({ toFake: ['Date'] });

      try {
        vi.setSystemTime(1_000_000);
        await subscribeOnce();
        await subscribeOnce();
        expect(testState.fetchMock).toHaveBeenCalledTimes(1);

        vi.setSystemTime(1_030_000);
        await subscribeOnce();
        expect(testState.fetchMock).toHaveBeenCalledTimes(2);
        expect(listener).not.toHaveBeenCalled();

        vi.setSystemTime(1_060_000);
        const unsubscribe = subscribeVimeoThumbnailUrl(vimeoUrl, listener);
        await vi.waitFor(() => expect(listener).toHaveBeenCalled());
        unsubscribe();
        expect(testState.fetchMock).toHaveBeenCalledTimes(3);
        expect(getVimeoThumbnailUrlSnapshot(vimeoUrl)).toBe(thumbnailUrl);
      } finally {
        vi.useRealTimers();
      }
    });

    it('turns the oEmbed thumbnail into a 1280px jpg file link for media-only boards', async () => {
      testState.fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ thumbnail_url: 'https://i.vimeocdn.com/video/1998712625-bf894a18-d_640?region=us' }),
      });
      expect(await getVimeoThumbnailFileUrlFromLink(' https://vimeo.com/1007 ')).toBe('https://i.vimeocdn.com/video/1998712625-bf894a18-d_1280.jpg');

      testState.cachedThumbnails.set('https://vimeo.com/1008', 'https://i.vimeocdn.com/video/unexpected-format.png');
      testState.fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ thumbnail_url: 'https://i.vimeocdn.com/video/unexpected-format.png' }) });
      expect(await getVimeoThumbnailFileUrlFromLink('https://vimeo.com/1008')).toBeUndefined();

      expect(await getVimeoThumbnailFileUrlFromLink('https://vimeo.com/user123')).toBeUndefined();
    });

    it('shares one in-flight lookup between subscribers', async () => {
      let resolveResponse: (value: unknown) => void = () => {};
      testState.fetchMock.mockReturnValueOnce(new Promise((resolve) => (resolveResponse = resolve)));
      const firstListener = vi.fn();
      const secondListener = vi.fn();

      const unsubscribeFirst = subscribeVimeoThumbnailUrl('https://vimeo.com/1006', firstListener);
      const unsubscribeSecond = subscribeVimeoThumbnailUrl('https://vimeo.com/1006', secondListener);
      await vi.waitFor(() => expect(testState.fetchMock).toHaveBeenCalledOnce());
      resolveResponse({ ok: true, json: async () => ({ thumbnail_url: 'https://i.vimeocdn.com/video/shared-d_640' }) });

      await vi.waitFor(() => expect(secondListener).toHaveBeenCalled());
      expect(firstListener).toHaveBeenCalled();
      expect(testState.fetchMock).toHaveBeenCalledOnce();
      unsubscribeFirst();
      unsubscribeSecond();
    });
  });
});
