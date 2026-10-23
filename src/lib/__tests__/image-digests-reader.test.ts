import { describe, expect, it, vi } from 'vitest';
import { MAX_HASHED_IMAGE_BYTES, readImageDigests } from '../image-digests-reader';

const ABC_DIGESTS = { md5: '900150983cd24fb0d6963f7d28e17f72', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };

describe('readImageDigests', () => {
  it('reads the file through the browser cache as an anonymous CORS request and returns its SHA-256, and its MD5 when asked', async () => {
    const fetchImage = vi.fn(async () => new Response('abc'));

    await expect(readImageDigests('https://i.imgur.com/a.png', { md5: true }, fetchImage)).resolves.toEqual({ digests: ABC_DIGESTS });
    await expect(readImageDigests('https://i.imgur.com/a.png', { md5: false }, fetchImage)).resolves.toEqual({ digests: { sha256: ABC_DIGESTS.sha256 } });
    expect(fetchImage).toHaveBeenCalledWith('https://i.imgur.com/a.png', expect.objectContaining({ mode: 'cors', credentials: 'omit', cache: 'force-cache' }));
  });

  it('asks the host again when the cached copy has no CORS headers, as with a host that varies them on Origin', async () => {
    const fetchImage = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.cache === 'force-cache') throw new TypeError('Failed to fetch');
      return new Response('abc');
    });

    await expect(readImageDigests('https://forgeimg.net/a.png', { md5: false }, fetchImage)).resolves.toEqual({ digests: { sha256: ABC_DIGESTS.sha256 } });
    expect(fetchImage.mock.calls.map(([, init]) => init?.cache)).toEqual(['force-cache', 'no-cache']);
  });

  it('blames the host when the browser refuses the request, and only the file when offline, on an HTTP error or for a large file', async () => {
    const rejectCors = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.mode === 'no-cors') return new Response(null, { status: 200 });
      throw new TypeError('Failed to fetch');
    });
    await expect(readImageDigests('https://preview.redd.it/a.png', { md5: false }, rejectCors)).resolves.toEqual({ error: 'unreadable-host' });

    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(readImageDigests('https://i.imgur.com/a.png', { md5: false }, offline)).resolves.toEqual({ error: 'unreadable-file' });

    await expect(readImageDigests('https://i.imgur.com/missing.png', { md5: false }, async () => new Response('gone', { status: 404 }))).resolves.toEqual({
      error: 'unreadable-file',
    });

    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    // No content-length, and more bytes than the limit: reading stops at the limit instead of buffering it all.
    const endlessBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readImageDigests('https://i.imgur.com/endless.png', { md5: false }, async () => new Response(endlessBody))).resolves.toEqual({
      error: 'unreadable-file',
    });
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThanOrEqual(MAX_HASHED_IMAGE_BYTES + 2 * chunk.byteLength);

    const largeResponse = new Response('abc', { headers: { 'content-length': String(MAX_HASHED_IMAGE_BYTES + 1) } });
    await expect(readImageDigests('https://i.imgur.com/huge.png', { md5: false }, async () => largeResponse)).resolves.toEqual({ error: 'unreadable-file' });
  });
});
