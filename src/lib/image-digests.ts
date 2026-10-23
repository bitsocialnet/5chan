import type { ImageDigests, ImageDigestsResult } from './image-digests-reader';

export type { ImageDigests };

// Each entry is two short hex strings keyed by a link.
const MAX_CACHED_DIGESTS = 2000;
// Each read holds a whole file in the worker until it is hashed.
const MAX_CONCURRENT_READS = 2;

/** Digests by link for this session. null marks a file that could not be read, so it is not read again. */
const digestsByUrl = new Map<string, ImageDigests | null>();
const pendingReads = new Map<string, { md5: boolean; read: Promise<ImageDigests | null> }>();
// One unreadable file says little about its host: a missing file's error page can lack CORS headers,
// and some hosts allow reading only some files. A host is skipped only after this many unreadable
// files and none readable.
const UNREADABLE_FILES_BEFORE_SKIPPING_HOST = 3;
const readableHosts = new Set<string>();
const unreadableFileCounts = new Map<string, number>();
const unreadableHosts = new Set<string>();
const queuedReads: Array<() => void> = [];
let activeReads = 0;

let worker: Worker | null | undefined;
let nextMessageId = 0;
const workerReplies = new Map<number, (result: ImageDigestsResult) => void>();

const getReadableHost = (url: string): string | undefined => {
  try {
    const { host, protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? host : undefined;
  } catch {
    return undefined;
  }
};

const failAllReplies = () => {
  workerReplies.forEach((reply) => reply({ error: 'unreadable-file' }));
  workerReplies.clear();
};

const getWorker = (): Worker | null => {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./image-digests-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; result: ImageDigestsResult }>) => {
      workerReplies.get(event.data.id)?.(event.data.result);
      workerReplies.delete(event.data.id);
    };
    // A worker that fails to start would leave every read waiting, so hashing stops for the session.
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      failAllReplies();
    };
  } catch {
    worker = null;
  }
  return worker;
};

const readInWorker = (url: string, md5: boolean): Promise<ImageDigestsResult> =>
  new Promise((resolve) => {
    const digestsWorker = getWorker();
    if (!digestsWorker) {
      resolve({ error: 'unreadable-file' });
      return;
    }
    const id = nextMessageId++;
    workerReplies.set(id, resolve);
    digestsWorker.postMessage({ id, url, md5 });
  });

const runQueued = <T>(read: () => Promise<T>): Promise<T> =>
  new Promise((resolve) => {
    const run = () => {
      activeReads++;
      read()
        .then(resolve)
        .finally(() => {
          activeReads--;
          queuedReads.shift()?.();
        });
    };
    if (activeReads < MAX_CONCURRENT_READS) run();
    else queuedReads.push(run);
  });

const rememberDigests = (url: string, digests: ImageDigests | null) => {
  if (!digestsByUrl.has(url) && digestsByUrl.size >= MAX_CACHED_DIGESTS) {
    const oldestUrl = digestsByUrl.keys().next().value;
    if (oldestUrl !== undefined) digestsByUrl.delete(oldestUrl);
  }
  digestsByUrl.set(url, digests);
};

// The images the page loaded most recently, hashed or not, so a hash added to the list later can still
// be checked against the images on screen. Enough for a page of posts.
const MAX_LOADED_IMAGES = 300;
const loadedImageUrls = new Set<string>();

export const rememberLoadedImage = (url: string) => {
  loadedImageUrls.delete(url);
  loadedImageUrls.add(url);
  if (loadedImageUrls.size > MAX_LOADED_IMAGES) {
    const oldestUrl = loadedImageUrls.values().next().value;
    if (oldestUrl !== undefined) loadedImageUrls.delete(oldestUrl);
  }
};

export const getLoadedImageUrls = (): string[] => [...loadedImageUrls];

/** A link's digests if this session already hashed it, null if it could not be read, undefined if not tried. */
export const getCachedImageDigests = (url: string): ImageDigests | null | undefined => digestsByUrl.get(url);

export const forEachCachedImageDigests = (callback: (url: string, digests: ImageDigests) => void) => {
  digestsByUrl.forEach((digests, url) => {
    if (digests) callback(url, digests);
  });
};

const hasDigests = (digests: ImageDigests | null | undefined, md5: boolean): digests is ImageDigests | null =>
  digests === null || (digests !== undefined && (!md5 || digests.md5 !== undefined));

/**
 * Hashes an image the page has loaded, at most once per link and session (twice if its MD5 is asked
 * for later). Resolves to null when the browser does not let pages read the file, which is the case
 * for every file on a host without CORS.
 */
export const hashImage = (url: string, { md5 = false }: { md5?: boolean } = {}): Promise<ImageDigests | null> => {
  const cached = digestsByUrl.get(url);
  if (hasDigests(cached, md5)) return Promise.resolve(cached);
  const host = getReadableHost(url);
  if (!host || unreadableHosts.has(host)) return Promise.resolve(null);
  const pending = pendingReads.get(url);
  if (pending) return pending.md5 || !md5 ? pending.read : pending.read.then(() => hashImage(url, { md5 }));

  const read = runQueued(() => (unreadableHosts.has(host) ? Promise.resolve<ImageDigestsResult>({ error: 'unreadable-host' }) : readInWorker(url, md5))).then(
    (result) => {
      pendingReads.delete(url);
      if ('digests' in result) {
        readableHosts.add(host);
        rememberDigests(url, result.digests);
        return result.digests;
      }
      if (result.error === 'unreadable-host' && !readableHosts.has(host)) {
        const unreadableFiles = (unreadableFileCounts.get(host) ?? 0) + 1;
        unreadableFileCounts.set(host, unreadableFiles);
        if (unreadableFiles >= UNREADABLE_FILES_BEFORE_SKIPPING_HOST) unreadableHosts.add(host);
      }
      // A failed read for the MD5 keeps the SHA-256 an earlier read found.
      const earlierDigests = digestsByUrl.get(url);
      if (earlierDigests) return earlierDigests;
      rememberDigests(url, null);
      return null;
    },
  );
  pendingReads.set(url, { md5, read });
  return read;
};
