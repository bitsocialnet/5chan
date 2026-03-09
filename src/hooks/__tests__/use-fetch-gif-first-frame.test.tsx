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
  imageShouldFail: false,
  nextBlobId: 0,
  toBlobReturnsNull: false,
  xhrCalls: [] as string[],
  xhrResponses: new Map<string, { response?: ArrayBuffer; status: number; statusText: string }>(),
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks/dist/lib/localforage-lru/index.js', () => ({
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

  readAsArrayBuffer() {
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

  it('reuses a cached frame url when the cached asset is still fetchable', async () => {
    testState.cacheGetItemMock.mockResolvedValueOnce('blob:cached-frame');
    testState.fetchMock.mockResolvedValueOnce({ ok: true });

    const { getState } = await renderHook('https://cdn.example/animated.gif');

    expect(getState()).toEqual({
      frameUrl: 'blob:cached-frame',
      status: 'ready',
    });
    expect(testState.fetchMock).toHaveBeenCalledWith('blob:cached-frame');
    expect(testState.xhrCalls).toEqual([]);
    expect(testState.cacheSetItemMock).not.toHaveBeenCalled();
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
    expect(testState.cacheSetItemMock).toHaveBeenCalledWith('https://cdn.example/animated.gif', 'blob:generated-2');
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:generated-1');
  });

  it('reads File inputs through FileReader and caches the result', async () => {
    testState.cacheGetItemMock.mockResolvedValueOnce(null);
    const source = new File(['gif-bytes'], 'reply.gif', { type: 'image/gif' });

    const { getState } = await renderHook(source);

    expect(getState().status).toBe('ready');
    expect(getState().frameUrl).toBe('blob:generated-2');
    expect(testState.xhrCalls).toEqual([]);
    expect(testState.cacheSetItemMock).toHaveBeenCalledWith(source, 'blob:generated-2');
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
