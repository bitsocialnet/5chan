import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  cacheGetItemMock: vi.fn(),
  cacheSetItemMock: vi.fn(),
  fetchMock: vi.fn(),
  fileBuffer: new Uint8Array([71, 73, 70]).buffer,
  fileReadCalls: [] as File[],
  imageShouldFail: false,
  nextBlobId: 0,
  toBlobReturnsNull: false,
  xhrCalls: [] as string[],
  xhrResponses: new Map<string, { response?: ArrayBuffer; status: number; statusText: string }>(),
}));

vi.mock('@bitsocial/bitsocial-react-hooks/dist/lib/localforage-lru/index.js', () => ({
  default: {
    createInstance: () => ({
      getItem: testState.cacheGetItemMock,
      setItem: testState.cacheSetItemMock,
    }),
  },
}));

type HookResult = {
  frameUrl: string | null;
  status: 'failed' | 'idle' | 'loading' | 'ready';
};

let container: HTMLDivElement;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let createObjectUrlSpy: ReturnType<typeof vi.fn>;
let revokeObjectUrlSpy: ReturnType<typeof vi.fn>;
let root: Root;

class MockXMLHttpRequest {
  onloadend: (() => void) | null = null;
  response: ArrayBuffer | undefined;
  responseType = '';
  status = 0;
  statusText = '';
  private url = '';

  open(_method: string, url: string) {
    this.url = url;
  }

  send() {
    testState.xhrCalls.push(this.url);
    const response = testState.xhrResponses.get(this.url) ?? {
      response: undefined,
      status: 500,
      statusText: 'Failed',
    };
    this.response = response.response;
    this.status = response.status;
    this.statusText = response.statusText;
    queueMicrotask(() => this.onloadend?.());
  }
}

class MockFileReader {
  onload: (() => void) | null = null;
  result: ArrayBuffer | null = null;

  readAsArrayBuffer(file: File) {
    testState.fileReadCalls.push(file);
    this.result = testState.fileBuffer;
    queueMicrotask(() => this.onload?.());
  }
}

class MockImage {
  height = 120;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  width = 160;

  set src(_value: string) {
    queueMicrotask(() => {
      if (testState.imageShouldFail) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    });
  }
}

const flushEffects = async (count = 6) => {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const dispatchRender = async (rootToRender: Root, element: React.ReactElement) => {
  await act(async () => {
    rootToRender.render(element);
  });
  await flushEffects();
};

const renderHook = async (source: unknown) => {
  vi.resetModules();
  const { default: useFetchGifFirstFrame } = await import('../use-fetch-gif-first-frame');
  let latestState: HookResult = { frameUrl: null, status: 'idle' };

  const HookHarness = ({ value }: { value: unknown }) => {
    latestState = useFetchGifFirstFrame(value as any);
    return createElement('div', {
      'data-frame-url': latestState.frameUrl ?? '',
      'data-status': latestState.status,
    });
  };

  await dispatchRender(root, createElement(HookHarness, { value: source }));
  return {
    getState: () => latestState,
    HookHarness,
    useFetchGifFirstFrame,
  };
};

describe('useFetchGifFirstFrame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.cacheGetItemMock.mockReset();
    testState.cacheSetItemMock.mockReset();
    testState.fetchMock.mockReset();
    testState.fileBuffer = new Uint8Array([71, 73, 70]).buffer;
    testState.fileReadCalls = [];
    testState.imageShouldFail = false;
    testState.nextBlobId = 0;
    testState.toBlobReturnsNull = false;
    testState.xhrCalls = [];
    testState.xhrResponses = new Map();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', testState.fetchMock);
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('Image', MockImage as unknown as typeof Image);
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest as unknown as typeof XMLHttpRequest);
    createObjectUrlSpy = vi.fn(() => `blob:generated-${++testState.nextBlobId}`);
    revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrlSpy,
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => ({
            drawImage: vi.fn(),
          }),
          height: 0,
          toBlob: (callback: (blob: Blob | null) => void) => callback(testState.toBlobReturnsNull ? null : new Blob(['frame'])),
          width: 0,
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    }) as typeof document.createElement);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns an idle state when no url is provided', async () => {
    const { getState } = await renderHook(undefined);
    expect(getState()).toEqual({
      frameUrl: null,
      status: 'idle',
    });
  });

  it('migrates a still-valid legacy object URL to durable frame bytes', async () => {
    const frame = new Blob(['cached frame'], { type: 'image/png' });
    testState.cacheGetItemMock.mockResolvedValueOnce('blob:cached-frame');
    testState.fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => frame });

    const { getState } = await renderHook('https://cdn.example/animated.gif');

    expect(getState()).toEqual({
      frameUrl: 'blob:generated-1',
      status: 'ready',
    });
    expect(testState.fetchMock).toHaveBeenCalledWith('blob:cached-frame');
    expect(testState.xhrCalls).toEqual([]);
    expect(testState.cacheSetItemMock).toHaveBeenCalledWith('https://cdn.example/animated.gif', frame);
  });

  it('loads persisted frame bytes without a network request or GIF decoding', async () => {
    const frame = new Blob(['cached frame'], { type: 'image/png' });
    testState.cacheGetItemMock.mockResolvedValueOnce(frame);

    const { getState } = await renderHook('https://cdn.example/animated.gif');

    expect(getState()).toEqual({ frameUrl: 'blob:generated-1', status: 'ready' });
    expect(createObjectUrlSpy).toHaveBeenCalledWith(frame);
    expect(testState.fetchMock).not.toHaveBeenCalled();
    expect(testState.xhrCalls).toEqual([]);
    expect(testState.cacheSetItemMock).not.toHaveBeenCalled();
  });

  it('restores a ready frame synchronously on repeated Activity reveals without reloading its bytes', async () => {
    const frame = new Blob(['cached frame'], { type: 'image/png' });
    testState.cacheGetItemMock.mockResolvedValueOnce(frame).mockReturnValue(new Promise(() => {}));
    const { getState, HookHarness } = await renderHook(undefined);
    const renderActivity = (mode: 'hidden' | 'visible') =>
      createElement(React.Activity, {
        mode,
        // oxlint-disable-next-line react/no-children-prop -- ActivityProps types children as required, so createElement only accepts it inside the props object
        children: createElement(HookHarness, { value: 'https://cdn.example/activity.gif' }),
      });
    await dispatchRender(root, renderActivity('visible'));
    expect(getState().status).toBe('ready');

    for (let index = 0; index < 2; index++) {
      const previousUrl = getState().frameUrl;
      act(() => root.render(renderActivity('hidden')));
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith(previousUrl);

      // Synchronous act leaves promises pending: the reveal must finish before any DB read can settle.
      act(() => root.render(renderActivity('visible')));
      expect(getState().status).toBe('ready');
      expect(getState().frameUrl).not.toBe(previousUrl);
      expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith(getState().frameUrl);
      expect(container.querySelector('[data-frame-url]')?.getAttribute('data-frame-url')).toBe(getState().frameUrl);
    }

    expect(testState.cacheGetItemMock).toHaveBeenCalledOnce();
    expect(testState.fetchMock).not.toHaveBeenCalled();
    expect(testState.xhrCalls).toEqual([]);
    expect(testState.cacheSetItemMock).not.toHaveBeenCalled();
    expect(createObjectUrlSpy.mock.calls.every(([blob]) => blob === frame)).toBe(true);

    const finalUrl = getState().frameUrl;
    act(() => root.render(null));
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(finalUrl);
  });

  it('never restores a previous source or lets a late request replace the current frame', async () => {
    const firstSource = 'https://cdn.example/first.gif';
    const pendingSource = 'https://cdn.example/pending.gif';
    const currentSource = 'https://cdn.example/current.gif';
    const firstFrame = new Blob(['first frame']);
    const currentFrame = new Blob(['current frame']);
    let resolvePending!: (blob: Blob) => void;
    testState.cacheGetItemMock.mockImplementation((source) =>
      source === pendingSource
        ? new Promise((resolve) => {
            resolvePending = resolve;
          })
        : Promise.resolve(source === firstSource ? firstFrame : currentFrame),
    );
    const { getState, HookHarness } = await renderHook(undefined);
    const renderActivity = (mode: 'hidden' | 'visible', value: string) =>
      createElement(React.Activity, {
        mode,
        // oxlint-disable-next-line react/no-children-prop -- ActivityProps types children as required, so createElement only accepts it inside the props object
        children: createElement(HookHarness, { value }),
      });
    await dispatchRender(root, renderActivity('visible', firstSource));
    const previousUrl = getState().frameUrl;
    act(() => root.render(renderActivity('hidden', firstSource)));
    act(() => root.render(renderActivity('visible', pendingSource)));
    expect(getState()).toEqual({ frameUrl: null, status: 'loading' });
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(previousUrl);

    await dispatchRender(root, renderActivity('visible', currentSource));
    const currentUrl = getState().frameUrl;
    expect(getState().status).toBe('ready');
    await act(async () => resolvePending(new Blob(['late frame'])));
    expect(getState().frameUrl).toBe(currentUrl);

    act(() => root.render(renderActivity('hidden', currentSource)));
    act(() => root.render(renderActivity('visible', currentSource)));
    expect(getState().status).toBe('ready');
    expect(getState().frameUrl).not.toBe(currentUrl);
    expect(createObjectUrlSpy).toHaveBeenLastCalledWith(currentFrame);
    expect(testState.cacheGetItemMock).toHaveBeenCalledTimes(3);
    expect(testState.xhrCalls).toEqual([]);
  });

  it('fetches, parses, and caches a generated frame when no usable cache entry exists', async () => {
    testState.cacheGetItemMock.mockResolvedValueOnce(null);
    testState.xhrResponses.set('https://cdn.example/animated.gif', {
      response: new Uint8Array([71, 73, 70]).buffer,
      status: 200,
      statusText: 'OK',
    });

    const { getState } = await renderHook('https://cdn.example/animated.gif');

    expect(getState().status).toBe('ready');
    expect(getState().frameUrl).toBe('blob:generated-2');
    expect(testState.xhrCalls).toEqual(['https://cdn.example/animated.gif']);
    expect(testState.cacheSetItemMock).toHaveBeenCalledWith('https://cdn.example/animated.gif', expect.any(Blob));
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:generated-1');
  });

  it('reads File inputs through FileReader without using persistent string keys', async () => {
    testState.cacheGetItemMock.mockResolvedValueOnce(null);
    const source = new File(['gif-bytes'], 'reply.gif', { type: 'image/gif' });

    const { getState } = await renderHook(source);

    expect(getState().status).toBe('ready');
    expect(getState().frameUrl).toBe('blob:generated-2');
    expect(testState.xhrCalls).toEqual([]);
    expect(testState.fileReadCalls).toEqual([source]);
    expect(testState.cacheGetItemMock).not.toHaveBeenCalled();
    expect(testState.cacheSetItemMock).not.toHaveBeenCalled();
  });

  it('keeps two distinct File previews separate even when their names and persistent string keys match', async () => {
    const first = new File(['first GIF'], 'reply.gif', { type: 'image/gif' });
    const second = new File(['second GIF'], 'reply.gif', { type: 'image/gif' });
    testState.cacheGetItemMock.mockResolvedValue(new Blob(['incorrect shared frame']));
    const { HookHarness } = await renderHook(first);
    await dispatchRender(root, createElement(HookHarness, { value: second }));

    expect(String(first)).toBe(String(second));
    expect(testState.fileReadCalls).toEqual([first, second]);
    expect(testState.cacheGetItemMock).not.toHaveBeenCalled();
    expect(testState.cacheSetItemMock).not.toHaveBeenCalled();
    expect(testState.xhrCalls).toEqual([]);
  });

  it('delivers decoded frames while a slow cache write stays pending and deduplicates later consumers', async () => {
    let rejectWrite!: (error: Error) => void;
    testState.cacheGetItemMock.mockResolvedValue(null);
    testState.cacheSetItemMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectWrite = reject;
      }),
    );
    const url = 'https://cdn.example/slow-cache.gif';
    testState.xhrResponses.set(url, { response: testState.fileBuffer, status: 200, statusText: 'OK' });
    const { getState, HookHarness } = await renderHook(url);
    expect(getState().status).toBe('ready');

    await dispatchRender(
      root,
      createElement(React.Fragment, null, createElement(HookHarness, { key: 'first', value: url }), createElement(HookHarness, { key: 'second', value: url })),
    );
    expect(Array.from(container.querySelectorAll('[data-status]'), (node) => node.getAttribute('data-status'))).toEqual(['ready', 'ready']);
    expect(testState.xhrCalls).toEqual([url]);
    expect(testState.cacheGetItemMock).toHaveBeenCalledOnce();
    expect(testState.cacheSetItemMock).toHaveBeenCalledOnce();

    await act(async () => rejectWrite(new Error('Quota exceeded')));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to cache GIF frame:', expect.any(Error));
    expect(Array.from(container.querySelectorAll('[data-status]'), (node) => node.getAttribute('data-status'))).toEqual(['ready', 'ready']);
  });

  it('shares pending requests and decoding while each mounted consumer owns its object URL', async () => {
    let finishCacheLookup!: (value: null) => void;
    testState.cacheGetItemMock.mockReturnValue(
      new Promise((resolve) => {
        finishCacheLookup = resolve;
      }),
    );
    const url = 'https://cdn.example/shared.gif';
    testState.xhrResponses.set(url, { response: testState.fileBuffer, status: 200, statusText: 'OK' });
    const { HookHarness } = await renderHook(url);

    await dispatchRender(
      root,
      createElement(React.Fragment, null, createElement(HookHarness, { key: 'first', value: url }), createElement(HookHarness, { key: 'second', value: url })),
    );
    expect(testState.cacheGetItemMock).toHaveBeenCalledTimes(1);

    finishCacheLookup(null);
    await flushEffects();
    expect(testState.xhrCalls).toEqual([url]);
    expect(testState.cacheSetItemMock).toHaveBeenCalledTimes(1);
    const consumers = Array.from(container.querySelectorAll('[data-frame-url]'));
    const firstFrame = consumers[0].getAttribute('data-frame-url');
    const secondFrame = consumers[1].getAttribute('data-frame-url');
    expect(firstFrame).toBeTruthy();
    expect(secondFrame).toBeTruthy();
    expect(firstFrame).not.toBe(secondFrame);

    await dispatchRender(root, createElement(React.Fragment, null, createElement(HookHarness, { key: 'second', value: url })));
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(firstFrame);
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith(secondFrame);
    expect(container.querySelector('[data-frame-url]')?.getAttribute('data-frame-url')).toBe(secondFrame);
  });

  it('retains completed frame bytes after consumers unmount and never creates an unused object URL', async () => {
    let finishCacheLookup!: (value: null) => void;
    testState.cacheGetItemMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishCacheLookup = resolve;
      }),
    );
    testState.cacheSetItemMock.mockImplementation(async (_url, frame) => {
      testState.cacheGetItemMock.mockResolvedValue(frame);
    });
    const url = 'https://cdn.example/offscreen.gif';
    testState.xhrResponses.set(url, { response: testState.fileBuffer, status: 200, statusText: 'OK' });
    const { HookHarness } = await renderHook(url);
    await act(async () => root.render(null));
    finishCacheLookup(null);
    await flushEffects();

    expect(testState.cacheSetItemMock).toHaveBeenCalledWith(url, expect.any(Blob));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:generated-1');
    await dispatchRender(root, createElement(HookHarness, { value: url }));
    expect(testState.xhrCalls).toEqual([url]);
    expect(container.querySelector('[data-status]')?.getAttribute('data-status')).toBe('ready');
  });

  it('regenerates expired legacy cache entries and keeps the frame ready if persistence fails', async () => {
    testState.cacheGetItemMock.mockResolvedValue('blob:expired');
    testState.fetchMock.mockRejectedValue(new Error('Object URL belongs to an earlier document'));
    testState.cacheSetItemMock.mockRejectedValue(new Error('Quota exceeded'));
    const url = 'https://cdn.example/regenerated.gif';
    testState.xhrResponses.set(url, { response: testState.fileBuffer, status: 200, statusText: 'OK' });

    const { getState } = await renderHook(url);

    expect(getState().status).toBe('ready');
    expect(testState.xhrCalls).toEqual([url]);
    expect(testState.cacheSetItemMock).toHaveBeenCalledWith(url, expect.any(Blob));
  });

  it('marks a failed url and short-circuits retries for the same source', async () => {
    testState.cacheGetItemMock.mockResolvedValue(null);
    testState.xhrResponses.set('https://cdn.example/broken.gif', {
      response: undefined,
      status: 500,
      statusText: 'Broken',
    });

    const { HookHarness, getState } = await renderHook('https://cdn.example/broken.gif');
    expect(getState()).toEqual({
      frameUrl: null,
      status: 'failed',
    });
    expect(testState.xhrCalls).toEqual(['https://cdn.example/broken.gif']);

    const retryRootContainer = document.createElement('div');
    document.body.appendChild(retryRootContainer);
    const retryRoot = createRoot(retryRootContainer);

    await dispatchRender(retryRoot, createElement(HookHarness, { value: 'https://cdn.example/broken.gif' }));
    expect(testState.xhrCalls).toEqual(['https://cdn.example/broken.gif']);

    act(() => retryRoot.unmount());
    retryRootContainer.remove();
  });
});
