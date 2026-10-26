// Ruffle's runtime files are copied from @ruffle-rs/ruffle into ruffle/ by vite.config.js;
// public/ruffle/sandbox-frame.js sits next to them and runs Ruffle inside the frame.
const RUFFLE_FRAME_SCRIPT = 'sandbox-frame.js';
const RUFFLE_SCRIPT = 'ruffle.js';
const RUFFLE_WASM_FILE_NAME_PATTERN = /^[\da-f]+\.wasm$/;

const escapeHtmlAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const getRufflePublicPath = () => new URL('ruffle/', document.baseURI).href;

export const isRuffleWasmFileName = (fileName: string) => RUFFLE_WASM_FILE_NAME_PATTERN.test(fileName);

export const fetchOk = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`.trim());
  }
  return response;
};

/** ruffle.js names its lazily loaded chunks as `"core.ruffle." + {id: "hash", ...}[id] + ".js"`. */
export const getRuffleChunkFileNames = (ruffleScript: string) => {
  const chunkHashes = /"core\.ruffle\."\+\{([^}]*)\}/.exec(ruffleScript)?.[1] ?? '';
  return [...chunkHashes.matchAll(/:"([\da-f]+)"/g)].map(([, hash]) => `core.ruffle.${hash}.js`);
};

export interface RuffleScripts {
  frameScript: string;
  /** Run in order: the chunks register with the webpack runtime that ruffle.js starts, so it never loads them by URL. */
  runtimeScripts: string[];
}

/**
 * The frame loads no script by URL: an opaque-origin frame under a file: page (Electron) may not
 * load file: scripts, and WebKit applies the CSP a srcdoc frame inherits from the page (vercel.json's)
 * with 'self' as the frame's opaque origin. So the page reads Ruffle's scripts and the frame runs
 * them inline under its nonce; vercel.json lists their hashes for the inherited policy.
 */
export const fetchRuffleScripts = async (publicPath: string, signal: AbortSignal): Promise<RuffleScripts> => {
  const fetchText = async (fileName: string) => (await fetchOk(new URL(fileName, publicPath).href, { signal })).text();
  const [frameScript, ruffleScript] = await Promise.all([fetchText(RUFFLE_FRAME_SCRIPT), fetchText(RUFFLE_SCRIPT)]);
  const chunkFileNames = getRuffleChunkFileNames(ruffleScript);
  if (chunkFileNames.length === 0) {
    throw new Error('Ruffle chunk file names not found in ruffle.js');
  }
  const chunkScripts = await Promise.all(chunkFileNames.map(fetchText));
  return { frameScript, runtimeScripts: [...chunkScripts, ruffleScript] };
};

export const createRuffleFrameNonce = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

/**
 * The document for the sandboxed (opaque-origin) SWF frame, with the frame script embedded under
 * `nonce`. Its CSP allows only scripts carrying that nonce and no connections, so nothing the SWF
 * does can reach the network; the page supplies the SWF and Ruffle's wasm module over postMessage.
 */
export const getRuffleFrameDocument = (publicPath: string, frameScript: string, nonce: string) => {
  if (/<\/script|<!--/i.test(frameScript)) {
    throw new Error(`${RUFFLE_FRAME_SCRIPT} cannot be embedded in an inline script`);
  }
  const contentSecurityPolicy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    // Ruffle keeps a hidden SWF ticking from a blob worker, which inherits this policy.
    'worker-src blob:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(contentSecurityPolicy)}">` +
    '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}ruffle-player{display:block;width:100%;height:100%}</style>' +
    `</head><body><script nonce="${escapeHtmlAttribute(nonce)}" data-public-path="${escapeHtmlAttribute(publicPath)}">${frameScript}</script></body></html>`
  );
};
