import { md5 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface ImageDigests {
  sha256: string;
  /** Only computed when asked for: it is slower to compute in JavaScript and only 4chan X lists need it. */
  md5?: string;
}

/**
 * A file's digests, or why it has none: its host sends no CORS headers, so no file on it can be read,
 * or only this file failed (an HTTP error, a timeout or a size over the limit).
 */
export type ImageDigestsResult = { digests: ImageDigests } | { error: 'unreadable-host' | 'unreadable-file' };

// Hashing holds the whole file in memory, and images this large are rare.
export const MAX_HASHED_IMAGE_BYTES = 20 * 1024 * 1024;
const READ_TIMEOUT_MS = 20_000;

const getSha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  // crypto.subtle only exists in secure contexts.
  if (globalThis.crypto?.subtle) {
    return bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)));
  }
  return bytesToHex(sha256(bytes));
};

export const readImageDigests = async (url: string, { md5: withMd5 }: { md5: boolean }, fetchImage: typeof fetch = fetch): Promise<ImageDigestsResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  const read = (cache: RequestCache) => fetchImage(url, { mode: 'cors', credentials: 'omit', cache, signal: controller.signal });
  try {
    let response: Response;
    try {
      // The image has already loaded on the page, so this normally reads the browser cache.
      response = await read('force-cache');
    } catch {
      if (controller.signal.aborted) return { error: 'unreadable-file' };
      try {
        // A host that sends CORS headers only to requests with an Origin header, as Forge does, leaves
        // the page's cached copy without them, so ask the host itself before giving up on it.
        response = await read('no-cache');
      } catch {
        // A host without CORS headers fails like a dropped connection, so check that the file can be
        // fetched at all before blaming the host: a host is skipped for the rest of the session.
        const reachable = await fetchImage(url, { mode: 'no-cors', cache: 'force-cache', signal: controller.signal }).then(
          () => true,
          () => false,
        );
        return { error: reachable && !controller.signal.aborted ? 'unreadable-host' : 'unreadable-file' };
      }
    }
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_HASHED_IMAGE_BYTES) {
      void response.body?.cancel();
      return { error: 'unreadable-file' };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_HASHED_IMAGE_BYTES) {
      return { error: 'unreadable-file' };
    }
    const sha256Hex = await getSha256(bytes);
    return { digests: withMd5 ? { sha256: sha256Hex, md5: bytesToHex(md5(bytes)) } : { sha256: sha256Hex } };
  } catch {
    return { error: 'unreadable-file' };
  } finally {
    clearTimeout(timeout);
  }
};
