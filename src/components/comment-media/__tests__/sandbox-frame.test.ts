import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// public/ruffle/sandbox-frame.js runs inside the sandboxed SWF frame. Here it runs in the test
// window, which is its own parent, so messages "from the page" are dispatched with source: window.
const FRAME_SCRIPT = readFileSync(join(process.cwd(), 'public/ruffle/sandbox-frame.js'), 'utf8');
const PUBLIC_PATH = 'https://5chan.app/ruffle/';

interface FrameRuffle {
  config?: Record<string, unknown>;
  newest?: () => { createPlayer: () => HTMLElement };
}

const frameWindow = window as unknown as { RufflePlayer?: FrameRuffle };

describe('Ruffle sandbox frame script', () => {
  const originalFetch = window.fetch;
  let listeners: Array<[string, EventListenerOrEventListenerObject]>;
  let sent: unknown[];
  let load: ReturnType<typeof vi.fn<(options: Record<string, unknown>) => Promise<void>>>;
  let createPlayer: ReturnType<typeof vi.fn<() => HTMLElement>>;

  const runFrameScript = (nonce?: string) => {
    const script = document.createElement('script');
    script.dataset.publicPath = PUBLIC_PATH;
    if (nonce) Object.defineProperty(script, 'nonce', { value: nonce });
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script });
    new Function(FRAME_SCRIPT)();
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
    frameWindow.RufflePlayer!.newest = () => ({ createPlayer });
  };

  const fromPage = (data: unknown, source: MessageEventSource | null = window) => window.dispatchEvent(new MessageEvent('message', { data, source }));

  beforeEach(() => {
    listeners = [];
    sent = [];
    const addEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      listeners.push([type, listener]);
      addEventListener(type, listener, options);
    });
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      sent.push(message);
    });
    load = vi.fn(async (_options: Record<string, unknown>) => undefined);
    createPlayer = vi.fn((): HTMLElement => Object.assign(document.createElement('ruffle-player'), { ruffle: () => ({ load }) }));
  });

  afterEach(() => {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener);
    vi.restoreAllMocks();
    window.fetch = originalFetch;
    delete frameWindow.RufflePlayer;
    document.head.querySelectorAll('script').forEach((script) => script.remove());
    document.body.textContent = '';
  });

  it('refuses every fetch except Ruffle’s wasm module', async () => {
    runFrameScript();

    await expect(window.fetch('http://127.0.0.1:8765/urlloader')).rejects.toThrow('Network access is disabled');
    await expect(window.fetch(new Request('https://example.com/movie.swf'))).rejects.toThrow('Network access is disabled');
    await expect(window.fetch(`${PUBLIC_PATH}ruffle.js`)).rejects.toThrow('Network access is disabled');
    await expect(window.fetch(`${PUBLIC_PATH}../72a20ef1c0b8ceb37720.wasm`)).rejects.toThrow('Network access is disabled');
    expect(sent).toEqual([]);
  });

  it('answers Ruffle’s wasm fetch with the bytes the page sends back', async () => {
    runFrameScript();

    const response = window.fetch(`${PUBLIC_PATH}72a20ef1c0b8ceb37720.wasm`);
    expect(sent).toEqual([{ type: 'ruffle-wasm-request', id: 0, fileName: '72a20ef1c0b8ceb37720.wasm' }]);
    fromPage({ type: 'ruffle-wasm', id: 0, bytes: new Uint8Array([0, 97, 115, 109]).buffer });

    const resolved = await response;
    expect(resolved.headers.get('Content-Type')).toBe('application/wasm');
    expect(new Uint8Array(await resolved.arrayBuffer())).toEqual(new Uint8Array([0, 97, 115, 109]));
  });

  it('fails Ruffle’s wasm fetch when the page cannot supply the module', async () => {
    runFrameScript();

    const response = window.fetch(`${PUBLIC_PATH}72a20ef1c0b8ceb37720.wasm`);
    fromPage({ type: 'ruffle-wasm', id: 0 });

    await expect(response).rejects.toThrow('Ruffle wasm module unavailable');
  });

  it('loads the posted SWF bytes with networking disabled and reports success', async () => {
    runFrameScript();
    expect(frameWindow.RufflePlayer?.config).toMatchObject({ allowNetworking: 'none', allowScriptAccess: false, publicPath: PUBLIC_PATH });

    const swf = new Uint8Array([70, 87, 83]).buffer;
    fromPage({ type: 'ruffle-load', swf });
    await vi.waitFor(() => expect(sent).toContainEqual({ type: 'ruffle-loaded' }));

    expect(createPlayer).toHaveBeenCalledOnce();
    expect(document.body.querySelector('ruffle-player')).toBeTruthy();
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        allowNetworking: 'none',
        allowScriptAccess: false,
        allowFullscreen: false,
        autoplay: 'off',
        openUrlMode: 'deny',
        publicPath: PUBLIC_PATH,
        data: new Uint8Array([70, 87, 83]),
      }),
    );
    expect(load.mock.calls[0][0]).not.toHaveProperty('url');
  });

  it('reports a failed load', async () => {
    runFrameScript();
    load.mockRejectedValue(new Error('Invalid SWF'));

    fromPage({ type: 'ruffle-load', swf: new ArrayBuffer(3) });

    await vi.waitFor(() => expect(sent).toContainEqual({ type: 'ruffle-failed', message: 'Invalid SWF' }));
  });

  it('runs scripts sent by the page inline under its nonce before creating the player', async () => {
    runFrameScript('frame-nonce');
    createPlayer.mockImplementation(() => {
      expect((window as unknown as { injectedScriptRan?: boolean }).injectedScriptRan).toBe(true);
      return Object.assign(document.createElement('ruffle-player'), { ruffle: () => ({ load }) });
    });
    // jsdom does not execute inserted scripts; record them instead.
    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      (window as unknown as { injectedScriptRan?: boolean }).injectedScriptRan = true;
      return node;
    });

    fromPage({ type: 'ruffle-load', swf: new ArrayBuffer(3), scripts: ['chunk', 'ruffle'] });
    await vi.waitFor(() => expect(sent).toContainEqual({ type: 'ruffle-loaded' }));

    const injected = appendChild.mock.calls.map(([node]) => node as HTMLScriptElement);
    expect(injected.map((script) => [script.textContent, script.getAttribute('nonce')])).toEqual([
      ['chunk', 'frame-nonce'],
      ['ruffle', 'frame-nonce'],
    ]);
    delete (window as unknown as { injectedScriptRan?: boolean }).injectedScriptRan;
  });

  it('ignores messages that do not come from the page, and a second load', async () => {
    runFrameScript();
    const otherWindow = document.createElement('iframe');
    document.body.appendChild(otherWindow);

    fromPage({ type: 'ruffle-load', swf: new ArrayBuffer(3) }, otherWindow.contentWindow);
    await Promise.resolve();
    expect(createPlayer).not.toHaveBeenCalled();

    fromPage({ type: 'ruffle-load', swf: new ArrayBuffer(3) });
    fromPage({ type: 'ruffle-load', swf: new ArrayBuffer(3) });
    await vi.waitFor(() => expect(sent).toContainEqual({ type: 'ruffle-loaded' }));
    expect(createPlayer).toHaveBeenCalledOnce();
  });

  it('announces readiness once the document has loaded', () => {
    runFrameScript();

    document.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('DOMContentLoaded'));

    expect(sent).toEqual([{ type: 'ruffle-frame-ready' }]);
  });
});
