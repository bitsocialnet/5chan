// Runs inline inside the sandboxed SWF frame built by src/components/comment-media/ruffle-player-frame.ts:
// an opaque origin whose CSP allows only scripts with its nonce and no connections at all. The page
// posts Ruffle's scripts, the SWF bytes, and Ruffle's wasm module when it asks for it, so the SWF has
// no way to reach the network (Ruffle's allowNetworking only blocks navigation on the web).
// vercel.json lists this file's hash: the frame inherits the page's CSP.
(() => {
  'use strict';

  const RUFFLE_CONFIG = {
    allowFullscreen: false,
    allowNetworking: 'none',
    allowScriptAccess: false,
    autoplay: 'off',
    openUrlMode: 'deny',
    polyfills: false,
    showSwfDownload: false,
  };
  const WASM_FILE_NAME_PATTERN = /^[\da-f]+\.wasm$/;

  const { publicPath } = document.currentScript.dataset;
  const nonce = document.currentScript.nonce;
  const pendingWasm = new Map();
  let nextWasmRequestId = 0;
  let loadStarted = false;

  const send = (message) => window.parent.postMessage(message, '*');

  // Ruffle fetches its wasm module with the global fetch. Serve that one file from the page and
  // refuse everything else (SWF-initiated loads), on top of the CSP that would block them anyway.
  window.fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI).href;
    const fileName = url.startsWith(publicPath) ? url.slice(publicPath.length) : '';
    if (!WASM_FILE_NAME_PATTERN.test(fileName)) {
      return Promise.reject(new TypeError('Network access is disabled for Flash content'));
    }
    const id = nextWasmRequestId++;
    return new Promise((resolve, reject) => {
      pendingWasm.set(id, { resolve, reject });
      send({ type: 'ruffle-wasm-request', id, fileName });
    }).then((bytes) => new Response(bytes, { headers: { 'Content-Type': 'application/wasm' } }));
  };

  window.RufflePlayer = { config: { ...RUFFLE_CONFIG, publicPath } };

  // The frame loads no script by URL (see ruffle-player-frame.ts); Ruffle's run inline under this frame's nonce.
  const runScripts = (sources) => {
    for (const source of sources) {
      const script = document.createElement('script');
      script.setAttribute('nonce', nonce);
      script.textContent = source;
      document.head.appendChild(script);
    }
  };

  const load = async (swf, scripts) => {
    try {
      runScripts(scripts);
      const player = window.RufflePlayer.newest().createPlayer();
      document.body.appendChild(player);
      await player.ruffle().load({ ...RUFFLE_CONFIG, publicPath, data: new Uint8Array(swf) });
      send({ type: 'ruffle-loaded' });
    } catch (error) {
      send({ type: 'ruffle-failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (message?.type === 'ruffle-wasm') {
      const request = pendingWasm.get(message.id);
      if (!request) return;
      pendingWasm.delete(message.id);
      if (message.bytes instanceof ArrayBuffer) request.resolve(message.bytes);
      else request.reject(new Error('Ruffle wasm module unavailable'));
    } else if (message?.type === 'ruffle-load' && message.swf instanceof ArrayBuffer && !loadStarted) {
      loadStarted = true;
      const scripts = Array.isArray(message.scripts) && message.scripts.every((source) => typeof source === 'string') ? message.scripts : [];
      void load(message.swf, scripts);
    }
  });

  window.addEventListener('DOMContentLoaded', () => send({ type: 'ruffle-frame-ready' }));
})();
