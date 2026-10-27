import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RufflePlayer from '../ruffle-player';
import { suspendMediaPlayback } from '../../../lib/utils/media-playback-utils';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SWF_URL = 'https://files.example.com/game.swf';
const WASM_FILE_NAME = '72a20ef1c0b8ceb37720.wasm';
const FRAME_SCRIPT = 'window.frameScript = true;';
const RUFFLE_SCRIPT = 'a.u=e=>"core.ruffle."+{482:"f00d"}[e]+".js"';
const ruffleUrl = (fileName: string) => new URL(`ruffle/${fileName}`, document.baseURI).href;

let container: HTMLDivElement;
let root: Root;
let files: Record<string, BodyInit>;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let onLoad: ReturnType<typeof vi.fn<() => void>>;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const render = async () => {
  await act(async () => {
    root.render(createElement(RufflePlayer, { url: SWF_URL, onLoad }));
  });
  await flush();
};

const getFrame = () => container.querySelector<HTMLIFrameElement>('iframe[data-testid="ruffle-player"]');

const fromFrame = async (data: unknown, source: MessageEventSource | null | undefined = getFrame()?.contentWindow) => {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const spyOnFramePosts = () => vi.spyOn(getFrame()!.contentWindow!, 'postMessage').mockImplementation(() => undefined);

describe('RufflePlayer', () => {
  beforeEach(() => {
    files = {
      [SWF_URL]: new Uint8Array([70, 87, 83]),
      [ruffleUrl('sandbox-frame.js')]: FRAME_SCRIPT,
      [ruffleUrl('ruffle.js')]: RUFFLE_SCRIPT,
      [ruffleUrl('core.ruffle.f00d.js')]: 'chunk',
      [ruffleUrl(WASM_FILE_NAME)]: new Uint8Array([0, 97, 115, 109]),
    };
    fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url in files ? new Response(files[url]) : new Response(null, { status: 404, statusText: 'Not Found' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onLoad = vi.fn<() => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('runs Ruffle in a script-only sandboxed frame that loads no script by URL and allows no connections', async () => {
    await render();

    const frame = getFrame();
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame?.title).toBe('SWF');
    expect(frame?.srcdoc).toMatch(/default-src 'none'; script-src 'nonce-[\w+/=]+' 'wasm-unsafe-eval'/);
    expect(frame?.srcdoc).toContain(`>${FRAME_SCRIPT}</script>`);
    expect(frame?.srcdoc).not.toContain(' src=');
    expect(container.textContent).toContain('loading SWF');
    expect(fetchMock).toHaveBeenCalledWith(SWF_URL, expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }));
  });

  it('gives each frame its own nonce', async () => {
    await render();
    const firstNonce = /'nonce-([^']+)'/.exec(getFrame()?.srcdoc ?? '')?.[1];
    act(() => root.unmount());
    root = createRoot(container);
    await render();

    expect(firstNonce).toBeTruthy();
    expect(/'nonce-([^']+)'/.exec(getFrame()?.srcdoc ?? '')?.[1]).not.toBe(firstNonce);
  });

  it('posts Ruffle’s scripts and the SWF bytes to the frame once it is ready and shows the player once it loads', async () => {
    await render();
    const postMessage = spyOnFramePosts();

    await fromFrame({ type: 'ruffle-frame-ready' });

    expect(postMessage).toHaveBeenCalledOnce();
    const [message, targetOrigin, transfer] = postMessage.mock.calls[0] as unknown as [{ type: string; swf: ArrayBuffer; scripts?: string[] }, string, Transferable[]];
    expect(message.type).toBe('ruffle-load');
    expect(new Uint8Array(message.swf)).toEqual(new Uint8Array([70, 87, 83]));
    expect(message.scripts).toEqual(['chunk', RUFFLE_SCRIPT]);
    expect(targetOrigin).toBe('*');
    expect(transfer).toEqual([message.swf]);

    await fromFrame({ type: 'ruffle-loaded' });

    expect(onLoad).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('loading SWF');
    expect(container.textContent).not.toContain('media_failed_to_load');
  });

  it('fetches Ruffle’s wasm module for the frame once, and nothing else it names', async () => {
    await render();
    const postMessage = spyOnFramePosts();

    await fromFrame({ type: 'ruffle-wasm-request', id: 4, fileName: 'https://evil.example/72a20ef1c0b8ceb37720.wasm' });
    await fromFrame({ type: 'ruffle-wasm-request', id: 5, fileName: '../secret.wasm' });
    const fetchesBefore = fetchMock.mock.calls.length;
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('.wasm'))).toBe(false);

    await fromFrame({ type: 'ruffle-wasm-request', id: 6, fileName: WASM_FILE_NAME });
    await fromFrame({ type: 'ruffle-wasm-request', id: 7, fileName: WASM_FILE_NAME });

    expect(fetchMock).toHaveBeenCalledTimes(fetchesBefore + 1);
    expect(fetchMock).toHaveBeenLastCalledWith(ruffleUrl(WASM_FILE_NAME), expect.any(Object));
    expect(postMessage).toHaveBeenCalledOnce();
    const [message] = postMessage.mock.calls[0] as unknown as [{ type: string; id: number; bytes: ArrayBuffer }];
    expect(message).toMatchObject({ type: 'ruffle-wasm', id: 6 });
    expect(new Uint8Array(message.bytes)).toEqual(new Uint8Array([0, 97, 115, 109]));
  });

  it('is left alone by the app’s offscreen-media suspension, which would restart the SWF', async () => {
    await render();
    const srcdoc = getFrame()?.srcdoc;

    expect(suspendMediaPlayback(container).iframeCount).toBe(0);
    expect(getFrame()?.srcdoc).toBe(srcdoc);
  });

  it('ignores a message without a source before the frame is mounted', async () => {
    delete files[ruffleUrl('core.ruffle.f00d.js')];
    fetchMock.mockImplementation((url: string) => (url === ruffleUrl('ruffle.js') ? new Promise<Response>(() => undefined) : Promise.resolve(new Response(files[url]))));
    await render();
    expect(getFrame()).toBeNull();

    await fromFrame({ type: 'ruffle-loaded' }, null);
    await fromFrame({ type: 'ruffle-failed', message: 'x' }, null);

    expect(onLoad).not.toHaveBeenCalled();
    expect(container.textContent).toContain('loading SWF');
  });

  it('replaces the frame and aborts the old downloads when the URL changes', async () => {
    await render();
    const firstFrame = getFrame();
    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    files['https://files.example.com/other.swf'] = new Uint8Array([67, 87, 83]);

    await act(async () => {
      root.render(createElement(RufflePlayer, { url: 'https://files.example.com/other.swf', onLoad }));
    });
    await flush();

    expect(firstSignal?.aborted).toBe(true);
    expect(firstFrame?.isConnected).toBe(false);
    expect(getFrame()).not.toBe(firstFrame);
    expect(fetchMock).toHaveBeenCalledWith('https://files.example.com/other.swf', expect.objectContaining({ credentials: 'omit' }));
  });

  it('ignores messages from other windows', async () => {
    await render();
    const postMessage = spyOnFramePosts();

    await fromFrame({ type: 'ruffle-frame-ready' }, window);
    await fromFrame({ type: 'ruffle-loaded' }, window);

    expect(postMessage).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    expect(container.textContent).toContain('loading SWF');
  });

  it('shows the fallback link when the SWF cannot be fetched', async () => {
    delete files[SWF_URL];
    await render();

    expect(container.textContent).toContain('media_failed_to_load');
    expect(container.querySelector('a')?.getAttribute('href')).toBe(SWF_URL);
  });

  it('shows the fallback link when Ruffle fails in the frame', async () => {
    await render();

    await fromFrame({ type: 'ruffle-failed', message: 'Invalid SWF' });

    expect(container.textContent).toContain('media_failed_to_load');
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('fails when the frame loads without its scripts reporting ready', async () => {
    await render();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await act(async () => {
      getFrame()?.dispatchEvent(new Event('load'));
      vi.advanceTimersByTime(9_999);
    });
    expect(container.textContent).toContain('loading SWF');
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(container.textContent).toContain('media_failed_to_load');
  });

  it('shows the fallback link without a frame when Ruffle’s scripts cannot be fetched', async () => {
    delete files[ruffleUrl('ruffle.js')];
    await render();

    expect(container.textContent).toContain('media_failed_to_load');
    expect(getFrame()).toBeNull();
  });

  it('removes the frame and aborts its downloads on unmount', async () => {
    await render();
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;

    act(() => root.unmount());
    root = createRoot(container);

    expect(signal?.aborted).toBe(true);
    expect(getFrame()).toBeNull();
  });
});
