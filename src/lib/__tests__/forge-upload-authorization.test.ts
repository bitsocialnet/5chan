import { webcrypto } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as cborg from 'cborg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createForgeUploadAuthorizer } from '../forge-upload-authorization';

afterEach(() => vi.unstubAllGlobals());

describe('Forge upload authorization', () => {
  it('signs the exact file hash, author, community and pass, without requiring randomUUID', async () => {
    vi.stubGlobal('crypto', { subtle: webcrypto.subtle, getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const key = ed25519.utils.randomSecretKey();
    const file = { size: 3, type: 'image/png', arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer } as File;
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const payload = cborg.decode(new Uint8Array(request.body as ArrayBuffer));
      const { signature, ...signed } = payload;
      expect(signed).toMatchObject({
        authorAddress: 'key-address',
        authorName: 'alice.bso',
        communityAddress: 'board.bso',
        precheckSessionId: 'precheck-pass',
        parentCid: 'parent-cid',
      });
      expect(signed.upload).toEqual({ sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81', byteLength: 3, mimeType: 'image/png' });
      expect(ed25519.verify(signature.signature, cborg.encode(signed), signature.publicKey)).toBe(true);
      return new Response(JSON.stringify({ token: 'single-use-proof' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const authorize = createForgeUploadAuthorizer({
      serverUrl: 'https://spamblocker.test/api/v1',
      communityAddress: 'board.bso',
      authorAddress: 'key-address',
      authorName: 'alice.bso',
      privateKey: btoa(String.fromCharCode(...key)),
      precheckSessionId: 'precheck-pass',
      parentCid: 'parent-cid',
    });
    const header = JSON.parse(atob((await authorize(file)).replace(/-/g, '+').replace(/_/g, '/')));
    expect(header.token).toBe('single-use-proof');
    expect(header.byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith('https://spamblocker.test/api/v1/upload/authorize', expect.anything());
  });
});
