import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRuffleScripts, getRuffleChunkFileNames, getRuffleFrameDocument, isRuffleWasmFileName } from '../ruffle-player-frame';

// Vitest runs from the repository root.
const RUFFLE_PACKAGE_DIRECTORY = join(process.cwd(), 'node_modules/@ruffle-rs/ruffle');
const FRAME_SCRIPT_PATH = join(process.cwd(), 'public/ruffle/sandbox-frame.js');

const parseFrameDocument = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const getContentSecurityPolicy = (doc: Document) => doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';

describe('getRuffleFrameDocument', () => {
  it('embeds the frame script under a nonce and allows no other scripts and no connections', () => {
    const doc = parseFrameDocument(getRuffleFrameDocument('https://5chan.app/ruffle/', 'window.frameScriptRan = true;', 'abc123'));
    const directives = getContentSecurityPolicy(doc).split('; ');

    expect(directives).toEqual([
      "default-src 'none'",
      "script-src 'nonce-abc123' 'wasm-unsafe-eval'",
      "style-src 'unsafe-inline'",
      'img-src data: blob:',
      'worker-src blob:',
      "base-uri 'none'",
      "form-action 'none'",
    ]);
    expect(directives.some((directive) => directive.startsWith('connect-src'))).toBe(false);
    expect(doc.scripts).toHaveLength(1);
    expect(doc.scripts[0].hasAttribute('src')).toBe(false);
    expect(doc.scripts[0].getAttribute('nonce')).toBe('abc123');
    expect(doc.scripts[0].dataset.publicPath).toBe('https://5chan.app/ruffle/');
    expect(doc.scripts[0].textContent).toBe('window.frameScriptRan = true;');
  });

  it('keeps the public path of an IPFS path gateway or a file: page', () => {
    const ipfsPath = 'https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/ruffle/';

    expect(parseFrameDocument(getRuffleFrameDocument(ipfsPath, '', 'n')).scripts[0].dataset.publicPath).toBe(ipfsPath);
    expect(parseFrameDocument(getRuffleFrameDocument('file:///app/build/ruffle/', '', 'n')).scripts[0].dataset.publicPath).toBe('file:///app/build/ruffle/');
  });

  it('refuses to embed a frame script that would end its script element early', () => {
    expect(() => getRuffleFrameDocument('https://5chan.app/ruffle/', 'const s = "</script>";', 'n')).toThrow();
    expect(() => getRuffleFrameDocument('https://5chan.app/ruffle/', 'const s = "<!--";', 'n')).toThrow();
  });

  it('can embed the shipped frame script unchanged', () => {
    const frameScript = readFileSync(FRAME_SCRIPT_PATH, 'utf8');
    const doc = parseFrameDocument(getRuffleFrameDocument('https://5chan.app/ruffle/', frameScript, 'n'));

    // vercel.json allows the script by the hash of its file, so the embedded text must match it exactly.
    expect(doc.scripts[0].textContent).toBe(frameScript);
  });
});

describe('isRuffleWasmFileName', () => {
  it('accepts only a bare wasm file name from Ruffle’s folder', () => {
    expect(isRuffleWasmFileName('72a20ef1c0b8ceb37720.wasm')).toBe(true);
    expect(isRuffleWasmFileName('../72a20ef1c0b8ceb37720.wasm')).toBe(false);
    expect(isRuffleWasmFileName('https://example.com/72a20ef1c0b8ceb37720.wasm')).toBe(false);
    expect(isRuffleWasmFileName('ruffle.js')).toBe(false);
  });
});

describe('getRuffleChunkFileNames', () => {
  it('finds the installed Ruffle’s chunk files in its ruffle.js', () => {
    const ruffleScript = readFileSync(join(RUFFLE_PACKAGE_DIRECTORY, 'ruffle.js'), 'utf8');
    const chunkFiles = readdirSync(RUFFLE_PACKAGE_DIRECTORY).filter((fileName) => /^core\.ruffle\.[\da-f]+\.js$/.test(fileName));

    expect(chunkFiles.length).toBeGreaterThan(0);
    expect(getRuffleChunkFileNames(ruffleScript).sort()).toEqual(chunkFiles.sort());
  });

  it('can run every chunk in one frame: modules they share are identical', () => {
    // The frame runs all chunks before ruffle.js, so a module id two chunks share keeps the last one's code.
    const chunkModules = readdirSync(RUFFLE_PACKAGE_DIRECTORY)
      .filter((fileName) => /^core\.ruffle\.[\da-f]+\.js$/.test(fileName))
      .map((fileName) => {
        const self = {} as { webpackChunkruffle_selfhosted?: Array<[number[], Record<string, () => void>]> };
        new Function('self', readFileSync(join(RUFFLE_PACKAGE_DIRECTORY, fileName), 'utf8'))(self);
        return self.webpackChunkruffle_selfhosted![0][1];
      });

    for (const modules of chunkModules) {
      for (const other of chunkModules) {
        for (const id of Object.keys(modules).filter((moduleId) => moduleId in other)) {
          expect(String(modules[id])).toBe(String(other[id]));
        }
      }
    }
  });
});

describe('fetchRuffleScripts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the frame script and the runtime scripts with the chunks before ruffle.js', async () => {
    const files: Record<string, string> = {
      'sandbox-frame.js': 'frame',
      'ruffle.js': 'a.u=e=>"core.ruffle."+{482:"f00d",655:"c0de"}[e]+".js"',
      'core.ruffle.f00d.js': 'chunk-482',
      'core.ruffle.c0de.js': 'chunk-655',
    };
    const fetchMock = vi.fn(async (url: string) => {
      const fileName = url.replace('file:///app/ruffle/', '');
      return fileName in files ? new Response(files[fileName]) : new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRuffleScripts('file:///app/ruffle/', new AbortController().signal)).resolves.toEqual({
      frameScript: 'frame',
      runtimeScripts: ['chunk-482', 'chunk-655', files['ruffle.js']],
    });
  });

  it('fails when ruffle.js does not name its chunks the expected way', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no chunk map here')),
    );

    await expect(fetchRuffleScripts('file:///app/ruffle/', new AbortController().signal)).rejects.toThrow('Ruffle chunk file names not found');
  });
});
