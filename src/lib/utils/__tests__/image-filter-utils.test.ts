import { describe, expect, it } from 'vitest';
import { FORGE_IMAGES_MEDIA_ORIGIN } from '../../forge-images-config';
import {
  addImageFilterLine,
  getImageFilterKey,
  getMatchingImageFilterHash,
  hasImageFilterLine,
  isImageFilterableMediaType,
  isImageHashableMediaType,
  parseImageFilterKeys,
  removeImageFilterLines,
  replaceImageFilterLine,
  getImageHashingNeeds,
} from '../image-filter-utils';

const SHA256 = '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11';
// The MD5 of "abc", in hex and in the base64 4chan's API uses.
const MD5 = '900150983cd24fb0d6963f7d28e17f72';
const MD5_BASE64 = 'kAFQmDzST7DWlj99KOF/cg==';

describe('getImageFilterKey', () => {
  it('reads the sha256 from both Forge URL forms', () => {
    expect(getImageFilterKey(`${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256}.png`)).toBe(SHA256);
    expect(getImageFilterKey(`${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256}/my%20photo.PNG`)).toBe(SHA256);
    expect(getImageFilterKey(`${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256}-extra/photo.jpg?download=1#top`)).toBe(SHA256);
  });

  it('keeps the exact link for a Forge path the edge would not serve', () => {
    const shortHashUrl = `${FORGE_IMAGES_MEDIA_ORIGIN}/abc/photo.png`;
    const upperCaseHashUrl = `${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256.toUpperCase()}.png`;
    expect(getImageFilterKey(shortHashUrl)).toBe(shortHashUrl);
    expect(getImageFilterKey(upperCaseHashUrl)).toBe(upperCaseHashUrl);
  });

  it('keeps the exact link for other hosts, even when it contains a hash', () => {
    expect(getImageFilterKey(' https://files.catbox.moe/8ten4y.png ')).toBe('https://files.catbox.moe/8ten4y.png');
    expect(getImageFilterKey(`https://example.com/${SHA256}.png`)).toBe(`https://example.com/${SHA256}.png`);
  });

  it('drops line breaks and tabs the way the URL parser does, so a link stays one line', () => {
    const link = `https://evil.example/x.png?\n${SHA256}\r\n&format=png`;
    const key = getImageFilterKey(link);
    expect(key).toBe(`https://evil.example/x.png?${SHA256}&format=png`);
    expect(key).toBe(new URL(link).href);
    expect(getImageFilterKey(`${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256.slice(0, 32)}\t${SHA256.slice(32)}.png`)).toBe(SHA256);
  });

  it('accepts a bare hash in any case', () => {
    expect(getImageFilterKey(SHA256.toUpperCase())).toBe(SHA256);
    expect(getImageFilterKey(MD5.toUpperCase())).toBe(MD5);
  });

  it("reads 4chan's base64 MD5, bare or as a 4chan X filter line with options", () => {
    expect(getImageFilterKey(MD5_BASE64)).toBe(MD5);
    expect(getImageFilterKey(`/${MD5_BASE64}/`)).toBe(MD5);
    expect(getImageFilterKey(`/${MD5_BASE64}/;boards:4chan.org/b;stub:no`)).toBe(MD5);
    expect(getImageFilterKey('/abc/')).toBe('/abc/');
  });

  it('returns nothing for blank values', () => {
    expect(getImageFilterKey('   ')).toBeUndefined();
  });
});

describe('parseImageFilterKeys', () => {
  it('reads one key per line, skipping blank and # lines', () => {
    const list = [`# spam image`, '', `${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256}/spam.png`, '  https://i.imgur.com/YpB7qfa.jpg  ', `  # ${SHA256}`].join('\n');
    expect([...parseImageFilterKeys(list)]).toEqual([SHA256, 'https://i.imgur.com/YpB7qfa.jpg']);
  });
});

describe('filter list lines', () => {
  it('appends a line without leaving blank lines', () => {
    expect(addImageFilterLine('', SHA256)).toBe(SHA256);
    expect(addImageFilterLine('# notes', SHA256)).toBe(`# notes\n${SHA256}`);
    expect(addImageFilterLine('# notes\n', SHA256)).toBe(`# notes\n${SHA256}`);
  });

  it('removes only the given lines', () => {
    expect(removeImageFilterLines(`# notes\n${SHA256}\nhttps://example.com/a.png`, [SHA256])).toBe('# notes\nhttps://example.com/a.png');
  });

  it('finds and replaces a line', () => {
    const list = `# notes\n https://example.com/a.png \n${SHA256}`;
    expect(hasImageFilterLine(list, 'https://example.com/a.png')).toBe(true);
    expect(hasImageFilterLine(list, 'https://example.com/b.png')).toBe(false);
    expect(replaceImageFilterLine(list, 'https://example.com/a.png', MD5)).toBe(`# notes\n${MD5}\n${SHA256}`);
  });
});

describe('image hashing', () => {
  const OTHER_LINK = 'https://i.imgur.com/YpB7qfa.jpg';
  const FORGE_LINK = `${FORGE_IMAGES_MEDIA_ORIGIN}/${SHA256}.png`;

  it('hashes an image only when a listed hash could match it, and asks for its MD5 only when one is listed', () => {
    expect(getImageHashingNeeds(OTHER_LINK, new Set([OTHER_LINK]))).toBeNull();
    expect(getImageHashingNeeds(OTHER_LINK, new Set([SHA256]))).toEqual({ md5: false });
    expect(getImageHashingNeeds(FORGE_LINK, new Set([SHA256]))).toBeNull();
    expect(getImageHashingNeeds(FORGE_LINK, new Set([MD5]))).toEqual({ md5: true });
    expect(getImageHashingNeeds(OTHER_LINK, new Set([SHA256, MD5]))).toEqual({ md5: true });
  });

  it('prefers a listed SHA-256 over a listed MD5', () => {
    const digests = { md5: MD5, sha256: SHA256 };
    expect(getMatchingImageFilterHash(digests, new Set([MD5, SHA256]))).toBe(SHA256);
    expect(getMatchingImageFilterHash(digests, new Set([MD5]))).toBe(MD5);
    expect(getMatchingImageFilterHash(digests, new Set([OTHER_LINK]))).toBeUndefined();
    expect(getMatchingImageFilterHash({ sha256: SHA256 }, new Set([MD5]))).toBeUndefined();
  });

  it('hashes images, not videos, audio or GIFs', () => {
    expect(isImageHashableMediaType('image')).toBe(true);
    expect(['gif', 'video', 'audio', 'webpage', undefined].some(isImageHashableMediaType)).toBe(false);
  });
});

describe('isImageFilterableMediaType', () => {
  it('offers the filter for posted files only', () => {
    expect(['image', 'gif', 'video', 'audio', 'swf'].every(isImageFilterableMediaType)).toBe(true);
    expect(isImageFilterableMediaType('webpage')).toBe(false);
    expect(isImageFilterableMediaType('iframe')).toBe(false);
    expect(isImageFilterableMediaType(undefined)).toBe(false);
  });
});
