import { FORGE_IMAGES_MEDIA_ORIGIN } from '../forge-images-config';

/** The settings section that opens the interface section on the filter list, like 4chan X's [show] opening its Image MD5 filter. */
export const MD5_FILTER_SECTION_ID = 'md5-filter';

const MD5_PATTERN = /^[a-f0-9]{32}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
// 4chan's API gives a file's MD5 in base64, and 4chan X lists it that way.
const BASE64_MD5_PATTERN = /^[A-Za-z0-9+/]{22}==$/;
// 4chan X writes an MD5 filter line as /<MD5>/, optionally followed by flags and ;options.
const FOURCHAN_X_HASH_LINE_PATTERN = /^\/([A-Za-z0-9+/]{22}==|[a-f0-9]{32}|[a-f0-9]{64})\/\w*(?:;.*)?$/i;
// Forge serves a file at /<sha256>.<ext> and at /<sha256>[anything]/<name>.<ext>, the same grammar as
// forge-images-server's media-url.ts, so the first 64 characters of the path are the file's sha256.
const FORGE_CANONICAL_PATH_PATTERN = /^\/([a-f0-9]{64})\.[a-z0-9]+$/;
const FORGE_NAMED_PATH_PATTERN = /^\/([a-f0-9]{64})[^/]*\/.*[^/]\.[A-Za-z0-9]+$/;

const getForgeMediaSha256 = (link: string): string | undefined => {
  if (!link.startsWith(`${FORGE_IMAGES_MEDIA_ORIGIN}/`)) return;
  const path = link.slice(FORGE_IMAGES_MEDIA_ORIGIN.length).replace(/[?#].*$/, '');
  return (FORGE_CANONICAL_PATH_PATTERN.exec(path) ?? FORGE_NAMED_PATH_PATTERN.exec(path))?.[1];
};

export const isImageFilterHash = (key: string): boolean => MD5_PATTERN.test(key) || SHA256_PATTERN.test(key);

const base64ToHex = (base64: string): string => Array.from(atob(base64), (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');

const getHashKey = (value: string): string | undefined => {
  if (MD5_PATTERN.test(value) || SHA256_PATTERN.test(value)) return value.toLowerCase();
  if (BASE64_MD5_PATTERN.test(value)) return base64ToHex(value);
};

/**
 * What the image filter matches a post's link by. A Forge link gives its file's sha256, which every
 * upload of the same file shares, like the MD5 4chan X filters by. Any other host only gives its exact
 * link, because its URL says nothing about the file; images there are matched by hash once they are
 * hashed after loading. Filter list lines go through the same function, so a line can be a SHA-256 or
 * MD5 hash (in hex, in base64 or as a 4chan X filter line) or a link.
 */
export const getImageFilterKey = (value: string): string | undefined => {
  // Drop tabs and line breaks like the URL parser does, so a link cannot write extra lines into the list.
  const trimmed = value.replace(/[\t\n\r]/g, '').trim();
  if (!trimmed) return;
  return getHashKey(FOURCHAN_X_HASH_LINE_PATTERN.exec(trimmed)?.[1] ?? trimmed) ?? getForgeMediaSha256(trimmed) ?? trimmed;
};

const hashKindsByKeys = new WeakMap<Set<string>, { md5: boolean; sha256: boolean }>();

/** Which kinds of hash the list holds, so loaded images are only hashed when a listed hash could match. */
export const getImageFilterHashKinds = (keys: Set<string>) => {
  let kinds = hashKindsByKeys.get(keys);
  if (!kinds) {
    kinds = { md5: false, sha256: false };
    for (const key of keys) {
      if (MD5_PATTERN.test(key)) kinds.md5 = true;
      else if (SHA256_PATTERN.test(key)) kinds.sha256 = true;
    }
    hashKindsByKeys.set(keys, kinds);
  }
  return kinds;
};

/**
 * Which digests of a loaded image could match a key in the list, or null when hashing it cannot match.
 * Any image can match an MD5, but a Forge link already carries its SHA-256, so only other links need
 * hashing to match a SHA-256.
 */
export const getImageHashingNeeds = (link: string, keys: Set<string>): { md5: boolean } | null => {
  const { md5, sha256 } = getImageFilterHashKinds(keys);
  return md5 || (sha256 && !getForgeMediaSha256(link.trim())) ? { md5 } : null;
};

/** The listed hash a file's digests match, if any. */
export const getMatchingImageFilterHash = (digests: { md5?: string; sha256: string }, keys: Set<string>): string | undefined =>
  keys.has(digests.sha256) ? digests.sha256 : digests.md5 && keys.has(digests.md5) ? digests.md5 : undefined;

/** The keys a filter list holds, one per line. Blank lines and lines starting with # are ignored. */
export const parseImageFilterKeys = (list: string): Set<string> => {
  const keys = new Set<string>();
  for (const line of list.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    const key = getImageFilterKey(line);
    if (key) keys.add(key);
  }
  return keys;
};

export const addImageFilterLine = (list: string, line: string): string => (list === '' || list.endsWith('\n') ? `${list}${line}` : `${list}\n${line}`);

export const removeImageFilterLines = (list: string, lines: readonly string[]): string => {
  const removedLines = new Set(lines);
  return list
    .split('\n')
    .filter((line) => !removedLines.has(line.trim()))
    .join('\n');
};

export const hasImageFilterLine = (list: string, line: string): boolean => list.split('\n').some((current) => current.trim() === line);

export const replaceImageFilterLine = (list: string, line: string, replacement: string): string =>
  list
    .split('\n')
    .map((current) => (current.trim() === line ? replacement : current))
    .join('\n');

// 4chan X filters a post's file; embeds and web page links are not files.
const FILTERABLE_MEDIA_TYPES = new Set(['image', 'gif', 'video', 'audio', 'swf']);

export const isImageFilterableMediaType = (type: string | undefined): boolean => Boolean(type && FILTERABLE_MEDIA_TYPES.has(type));

// Only images: a video or audio file is not downloaded until it plays, and a GIF thumbnail is a stored
// first frame, so hashing either would download the whole file.
export const isImageHashableMediaType = (type: string | undefined): boolean => type === 'image';
