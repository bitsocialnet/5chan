import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DIGESTS = { md5: '900150983cd24fb0d6963f7d28e17f72', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };

type Reply = { digests: { sha256: string; md5?: string } } | { error: 'unreadable-host' | 'unreadable-file' };

// Stands in for the hashing worker, replying with the result set for each link.
class FakeWorker {
  static posted: string[] = [];
  static askedMd5: boolean[] = [];
  static replies = new Map<string, Reply>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage({ id, url, md5 }: { id: number; url: string; md5: boolean }) {
    FakeWorker.posted.push(url);
    FakeWorker.askedMd5.push(md5);
    const reply = FakeWorker.replies.get(url) ?? { error: 'unreadable-file' };
    const result = 'digests' in reply && !md5 ? { digests: { sha256: reply.digests.sha256 } } : reply;
    setTimeout(() => this.onmessage?.({ data: { id, result } } as MessageEvent));
  }
  terminate() {}
}

const loadImageDigests = async () => {
  vi.resetModules();
  return import('../image-digests');
};

describe('hashImage', () => {
  beforeEach(() => {
    FakeWorker.posted = [];
    FakeWorker.askedMd5 = [];
    FakeWorker.replies = new Map();
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hashes each link once per session, sharing a read that is still in progress', async () => {
    const { getCachedImageDigests, hashImage } = await loadImageDigests();
    FakeWorker.replies.set('https://files.catbox.moe/a.png', { digests: DIGESTS });

    const [first, second] = await Promise.all([hashImage('https://files.catbox.moe/a.png'), hashImage('https://files.catbox.moe/a.png')]);
    await hashImage('https://files.catbox.moe/a.png');

    expect(first).toEqual({ sha256: DIGESTS.sha256 });
    expect(second).toEqual({ sha256: DIGESTS.sha256 });
    expect(FakeWorker.posted).toEqual(['https://files.catbox.moe/a.png']);

    // Its MD5 was not computed, so asking for it reads the file once more.
    await expect(hashImage('https://files.catbox.moe/a.png', { md5: true })).resolves.toEqual(DIGESTS);
    await hashImage('https://files.catbox.moe/a.png', { md5: true });
    expect(getCachedImageDigests('https://files.catbox.moe/a.png')).toEqual(DIGESTS);
    expect(FakeWorker.askedMd5).toEqual([false, true]);
  });

  it('stops reading from a host only after several unreadable files and none readable', async () => {
    const { hashImage } = await loadImageDigests();
    for (const name of ['a', 'b', 'c', 'd']) FakeWorker.replies.set(`https://preview.redd.it/${name}.png`, { error: 'unreadable-host' });
    FakeWorker.replies.set('https://i.imgur.com/ok.png', { digests: DIGESTS });
    for (const name of ['x', 'y', 'z']) FakeWorker.replies.set(`https://i.imgur.com/${name}.png`, { error: 'unreadable-host' });
    FakeWorker.replies.set('https://i.imgur.com/last.png', { digests: DIGESTS });

    for (const name of ['a', 'b', 'c', 'd']) await expect(hashImage(`https://preview.redd.it/${name}.png`)).resolves.toBeNull();
    // A host that allowed one read keeps being read, whatever later files do.
    await hashImage('https://i.imgur.com/ok.png');
    for (const name of ['x', 'y', 'z']) await hashImage(`https://i.imgur.com/${name}.png`);
    await expect(hashImage('https://i.imgur.com/last.png', { md5: true })).resolves.toEqual(DIGESTS);
    await expect(hashImage('data:image/png;base64,AAAA')).resolves.toBeNull();

    expect(FakeWorker.posted.filter((url) => url.includes('redd.it'))).toEqual([
      'https://preview.redd.it/a.png',
      'https://preview.redd.it/b.png',
      'https://preview.redd.it/c.png',
    ]);
    expect(FakeWorker.posted).toContain('https://i.imgur.com/last.png');
  });
});
