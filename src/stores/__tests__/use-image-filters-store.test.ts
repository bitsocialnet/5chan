import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORGE_IMAGES_MEDIA_ORIGIN } from '../../lib/forge-images-config';
import useImageFiltersStore from '../use-image-filters-store';

type Digests = { md5: string; sha256: string };

const digestsState = vi.hoisted(() => ({
  loaded: new Set<string>(),
  cache: new Map<string, Digests | null>(),
  results: new Map<string, Digests | null>(),
  hashImage: vi.fn(),
}));

vi.mock('../../lib/image-digests', () => ({
  getCachedImageDigests: (url: string) => digestsState.cache.get(url),
  forEachCachedImageDigests: (callback: (url: string, digests: Digests) => void) =>
    digestsState.cache.forEach((digests, url) => {
      if (digests) callback(url, digests);
    }),
  hashImage: digestsState.hashImage,
  rememberLoadedImage: (url: string) => digestsState.loaded.add(url),
  getLoadedImageUrls: () => [...digestsState.loaded],
}));

const SHA256 = '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11';
const FORGE_LINK = `${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256}/spam.png`;
const OTHER_LINK = 'https://i.imgur.com/YpB7qfa.jpg';
const OTHER_DIGESTS = { md5: '900150983cd24fb0d6963f7d28e17f72', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };

const getState = () => useImageFiltersStore.getState();
const flushHashing = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useImageFiltersStore', () => {
  beforeEach(() => {
    localStorage.clear();
    digestsState.loaded.clear();
    digestsState.cache.clear();
    digestsState.results.clear();
    digestsState.hashImage.mockReset();
    digestsState.hashImage.mockImplementation(async (url: string) => {
      const digests = digestsState.results.get(url) ?? null;
      digestsState.cache.set(url, digests);
      return digests;
    });
    useImageFiltersStore.setState({ imageFilters: '', filterKeys: new Set(), matchedLinks: {}, shownCids: {}, quickFilterNotice: null });
  });

  it('quick filters a Forge file by hash and an unreadable image by exact link, counting them on one notice', async () => {
    getState().setImageFilters('# my list');
    getState().quickFilter(FORGE_LINK, 'post-1', '/b', 'image');
    getState().quickFilter(OTHER_LINK, 'post-2', '/b', 'image');
    await flushHashing();

    expect(getState().imageFilters).toBe(`# my list\n${SHA256}\n${OTHER_LINK}`);
    expect([...getState().filterKeys]).toEqual([SHA256, OTHER_LINK]);
    expect(getState().quickFilterNotice).toEqual({ pathname: '/b', keys: [SHA256, OTHER_LINK] });
    expect(JSON.parse(localStorage.getItem('image-filters-store') ?? '{}').state).toEqual({ imageFilters: getState().imageFilters, matchedLinks: {} });
    expect(digestsState.hashImage.mock.calls).toEqual([[OTHER_LINK]]);
  });

  it('lists the SHA-256 of an image hashed earlier instead of its link', () => {
    digestsState.cache.set(OTHER_LINK, OTHER_DIGESTS);
    getState().quickFilter(OTHER_LINK, 'post-1', '/b', 'image');

    expect(getState().imageFilters).toBe(OTHER_DIGESTS.sha256);
    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.sha256 });
    expect(digestsState.hashImage).not.toHaveBeenCalled();
  });

  it('replaces the link with the SHA-256 once the image is hashed, keeping the post hidden and the undo working', async () => {
    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    getState().quickFilter(OTHER_LINK, 'post-1', '/b', 'image');
    expect(getState().imageFilters).toBe(OTHER_LINK);
    await flushHashing();

    expect(getState().imageFilters).toBe(OTHER_DIGESTS.sha256);
    expect(getState().quickFilterNotice).toEqual({ pathname: '/b', keys: [OTHER_DIGESTS.sha256] });
    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.sha256 });

    getState().undoQuickFilters();
    expect(getState().imageFilters).toBe('');
    expect(getState().matchedLinks).toEqual({});
  });

  it('does not hash videos, and leaves the list alone when the filter is undone before hashing finishes', async () => {
    getState().quickFilter('https://video.twimg.com/clip.mp4', 'post-1', '/b', 'video');
    expect(digestsState.hashImage).not.toHaveBeenCalled();
    getState().undoQuickFilters();

    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    getState().quickFilter(OTHER_LINK, 'post-2', '/b', 'image');
    getState().undoQuickFilters();
    await flushHashing();

    expect(getState().imageFilters).toBe('');
    expect(getState().quickFilterNotice).toBeNull();
  });

  it('undoes only what the notice added and closes it', () => {
    getState().setImageFilters(OTHER_LINK);
    getState().quickFilter(FORGE_LINK, 'post-1', '/b', 'image');
    getState().quickFilter(OTHER_LINK, 'post-2', '/b', 'image');
    getState().undoQuickFilters();

    expect(getState().imageFilters).toBe(OTHER_LINK);
    expect([...getState().filterKeys]).toEqual([OTHER_LINK]);
    expect(getState().quickFilterNotice).toBeNull();
  });

  it('starts a new notice on another page, so its undo leaves the earlier page alone', () => {
    getState().quickFilter(FORGE_LINK, 'post-1', '/b', 'image');
    getState().quickFilter(OTHER_LINK, 'post-2', '/a/thread/thread-1', 'image');
    getState().undoQuickFilters();

    expect(getState().imageFilters).toBe(SHA256);
  });

  it('hides a shown post again when its listed file is quick filtered, without adding a duplicate', () => {
    getState().setImageFilters(SHA256);
    getState().setPostShown('post-1', true);
    getState().quickFilter(FORGE_LINK, 'post-1', '/b', 'image');

    expect(getState().imageFilters).toBe(SHA256);
    expect(getState().shownCids).toEqual({});
    expect(getState().quickFilterNotice).toBeNull();
  });

  it('hashes a loaded image only when a listed hash could match it', () => {
    getState().hashLoadedImage(OTHER_LINK);
    getState().setImageFilters(OTHER_LINK);
    getState().hashLoadedImage(OTHER_LINK);
    expect(digestsState.hashImage).not.toHaveBeenCalled();

    // The first listed hash hashes the image that already loaded. A Forge link already carries its
    // SHA-256, so it needs hashing only for an MD5.
    getState().setImageFilters(SHA256);
    getState().hashLoadedImage(FORGE_LINK);
    expect(digestsState.hashImage.mock.calls).toEqual([[OTHER_LINK, { md5: false }]]);

    getState().setImageFilters(OTHER_DIGESTS.md5);
    expect(digestsState.hashImage.mock.calls.slice(1)).toEqual([
      [OTHER_LINK, { md5: true }],
      [FORGE_LINK, { md5: true }],
    ]);
  });

  it('remembers a link whose image hashed to a listed MD5 across reloads, until the hash leaves the list', async () => {
    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    getState().setImageFilters('/kAFQmDzST7DWlj99KOF/cg==/;boards:4chan.org/b');
    getState().hashLoadedImage(OTHER_LINK);
    await flushHashing();

    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.md5 });
    expect(JSON.parse(localStorage.getItem('image-filters-store') ?? '{}').state.matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.md5 });

    getState().setImageFilters('');
    expect(getState().matchedLinks).toEqual({});
  });

  it('does not write storage when a hashed image matches nothing', async () => {
    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    getState().setImageFilters(SHA256);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      getState().hashLoadedImage(OTHER_LINK);
      getState().setPostShown('post-1', false);
      getState().closeQuickFilterNotice();
      getState().undoQuickFilters();
      await flushHashing();

      expect(digestsState.hashImage).toHaveBeenCalledWith(OTHER_LINK, { md5: false });
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it('hashes images already on the page once the list first needs it, so copies of a quick filtered file hide too', async () => {
    const copyLink = 'https://files.catbox.moe/copy.jpg';
    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    digestsState.results.set(copyLink, OTHER_DIGESTS);
    getState().hashLoadedImage(copyLink);
    expect(digestsState.hashImage).not.toHaveBeenCalled();

    getState().quickFilter(OTHER_LINK, 'post-1', '/b', 'image');
    await flushHashing();
    await flushHashing();

    expect(getState().imageFilters).toBe(OTHER_DIGESTS.sha256);
    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.sha256, [copyLink]: OTHER_DIGESTS.sha256 });
  });

  it('only hides again a shown post whose image matched a listed MD5, without listing its SHA-256', () => {
    digestsState.cache.set(OTHER_LINK, OTHER_DIGESTS);
    getState().setImageFilters(OTHER_DIGESTS.md5);
    getState().setPostShown('post-1', true);
    getState().quickFilter(OTHER_LINK, 'post-1', '/b', 'image');

    expect(getState().imageFilters).toBe(OTHER_DIGESTS.md5);
    expect(getState().shownCids).toEqual({});
    expect(getState().quickFilterNotice).toBeNull();
  });

  it('drops the link instead of listing a hash twice when the image hashes to a listed hash', async () => {
    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    getState().setImageFilters(OTHER_DIGESTS.sha256);
    getState().quickFilter(OTHER_LINK, 'post-1', '/b', 'image');
    expect(getState().imageFilters).toBe(`${OTHER_DIGESTS.sha256}\n${OTHER_LINK}`);
    await flushHashing();

    expect(getState().imageFilters).toBe(OTHER_DIGESTS.sha256);
    expect(getState().quickFilterNotice).toBeNull();
    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.sha256 });
  });

  it('counts only list changes that remove a key, so a sorted catalog keeps its order through a quick filter', async () => {
    digestsState.results.set(OTHER_LINK, OTHER_DIGESTS);
    const startRevision = getState().listRevision;
    getState().quickFilter(OTHER_LINK, 'post-1', '/b', 'image');
    await flushHashing();

    // The link's line became the image's SHA-256, which hides the same posts.
    expect(getState().imageFilters).toBe(OTHER_DIGESTS.sha256);
    expect(getState().listRevision).toBe(startRevision);

    getState().undoQuickFilters();
    expect(getState().listRevision).toBe(startRevision + 1);
  });

  it('matches images hashed earlier in the session when their hash is added to the list', () => {
    digestsState.cache.set(OTHER_LINK, OTHER_DIGESTS);
    getState().setImageFilters(OTHER_DIGESTS.sha256);

    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.sha256 });
  });

  it('keeps shown posts out of storage, and rebuilds the keys and drops stale matches when the list loads', async () => {
    getState().setPostShown('post-1', true);
    localStorage.setItem(
      'image-filters-store',
      JSON.stringify({
        state: {
          imageFilters: `# notes\n${FORGE_LINK}\n${OTHER_DIGESTS.md5}`,
          matchedLinks: { [OTHER_LINK]: OTHER_DIGESTS.md5, 'https://example.com/a.png': 'f'.repeat(64) },
        },
        version: 0,
      }),
    );
    await useImageFiltersStore.persist.rehydrate();

    expect([...getState().filterKeys]).toEqual([SHA256, OTHER_DIGESTS.md5]);
    expect(getState().matchedLinks).toEqual({ [OTHER_LINK]: OTHER_DIGESTS.md5 });
    expect(JSON.parse(localStorage.getItem('image-filters-store') ?? '{}').state.shownCids).toBeUndefined();
  });
});
