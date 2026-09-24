import { FORGE_IMAGES_API_ORIGIN, FORGE_IMAGES_MEDIA_ORIGIN, FORGE_IMAGES_TURNSTILE_SITEKEY } from '../forge-images-config';
import type { UploadAttemptStage } from '../media-hosting/types';
import { getTurnstileToken } from './turnstile-utils';

/** Covers a 20 MB GIF (the largest launch cap) on a slow uplink; a hung request still fails. */
const FORGE_UPLOAD_TIMEOUT_MS = 120_000;
/** Longest wait for a pending (in moderation) image to start serving before the upload is reported as not ready. */
const PENDING_SERVE_WAIT_MS = 60_000;
const PENDING_POLL_MAX_INTERVAL_MS = 8_000;
const SERVE_PROBE_TIMEOUT_MS = 10_000;

/** Upload failure carrying the attempt stage that the upload orchestrator records. */
export class ForgeUploadError extends Error {
  readonly stage: UploadAttemptStage;

  constructor(message: string, stage: UploadAttemptStage) {
    super(message);
    this.name = 'ForgeUploadError';
    this.stage = stage;
  }
}

interface ForgeUploadOptions {
  /** Returns a fresh single-use Turnstile token. Defaults to the lazy-loaded Turnstile widget. */
  getToken?: () => Promise<string>;
  timeoutMs?: number;
  pendingServeWaitMs?: number;
}

interface ForgeUploadResponse {
  url?: unknown;
  status?: unknown;
  mime?: unknown;
}

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Reads `error.message` from the API's `{ error: { code, message } }` body. */
function getApiErrorMessage(body: unknown): string | undefined {
  const error = (body as { error?: { message?: unknown } } | null)?.error;
  return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : undefined;
}

/** The URL is written into a permanent public post, so it must point at the Forge media origin. */
function getUploadedUrl(body: ForgeUploadResponse | null): string {
  const url = body?.url;
  if (typeof url === 'string' && url.startsWith(`${FORGE_IMAGES_MEDIA_ORIGIN}/`)) return url;
  throw new ForgeUploadError('Upload failed: the response did not include a valid URL', 'provider_error');
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Loads the URL the way the post form's media check does (an <img>), so no CORS is involved. */
function canLoadImage(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const settle = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    };
    const timeoutId = setTimeout(() => {
      settle(false);
      // Stop the abandoned download so slow polls of a large GIF do not overlap.
      image.src = '';
    }, timeoutMs);
    image.onload = () => settle(true);
    image.onerror = () => settle(false);
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  });
}

/**
 * A new upload 404s until its moderation verdict lands (seconds; forge-images
 * ARCHITECTURE.md §2). The post form loads a link once when it is inserted and
 * blocks publishing if that load failed, so wait, bounded, until the image serves.
 */
async function waitUntilImageServes(url: string, maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  let delay = 1_000;
  while (Date.now() < deadline) {
    await sleep(Math.min(delay, deadline - Date.now()));
    // Keep the last probe from running far past the deadline.
    if (await canLoadImage(url, Math.min(SERVE_PROBE_TIMEOUT_MS, Math.max(deadline - Date.now(), 1_000)))) return true;
    delay = Math.min(delay * 2, PENDING_POLL_MAX_INTERVAL_MS);
  }
  return false;
}

/**
 * Upload a file to Forge Images (API contract: forge-images docs/ARCHITECTURE.md §4).
 * Returns the media URL for `live` uploads, and for `pending` images once they
 * pass moderation and start serving (up to a minute). An image still in review
 * after that fails instead: its URL inserted now would stay marked broken in the
 * post form even after it goes live, while a later retry dedups to `live` at once.
 * @throws ForgeUploadError with stage 'blocked' (Turnstile failed, or 403),
 * 'provider_error' (other API errors), 'timeout', or 'unknown' (network failure)
 */
export async function uploadToForge(file: File, options: ForgeUploadOptions = {}): Promise<string> {
  const { getToken = () => getTurnstileToken(FORGE_IMAGES_TURNSTILE_SITEKEY), timeoutMs = FORGE_UPLOAD_TIMEOUT_MS, pendingServeWaitMs = PENDING_SERVE_WAIT_MS } = options;

  let token: string;
  try {
    token = await getToken();
  } catch (error) {
    throw new ForgeUploadError(`Turnstile check failed: ${getErrorMessage(error)}`, 'blocked');
  }

  const formData = new FormData();
  // Text fields go before the file part so the API can reject a bad token
  // without reading the whole body. No custom headers: this stays a CORS simple request.
  formData.append('turnstile', token);
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const timeoutError = () => new ForgeUploadError(`Upload timed out after ${Math.round(timeoutMs / 1000)}s`, 'timeout');

  let body: ForgeUploadResponse | null;
  try {
    const response = await fetch(`${FORGE_IMAGES_API_ORIGIN}/api/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      const detail = getApiErrorMessage(errorBody) ?? `Upload failed: ${response.status} ${response.statusText}`.trim();
      // 403 is turnstile_failed or banned: an abuse-control block, not a bad file.
      throw new ForgeUploadError(detail, response.status === 403 ? 'blocked' : 'provider_error');
    }
    body = await response.json().catch(() => null);
    if (controller.signal.aborted) throw timeoutError();
  } catch (error) {
    if (error instanceof ForgeUploadError) throw error;
    if (controller.signal.aborted) throw timeoutError();
    throw new ForgeUploadError(`Network error: ${getErrorMessage(error)}`, 'unknown');
  } finally {
    clearTimeout(timeoutId);
  }

  const url = getUploadedUrl(body);
  if (body?.status === 'pending' && typeof body.mime === 'string' && body.mime.startsWith('image/') && pendingServeWaitMs > 0) {
    if (!(await waitUntilImageServes(url, pendingServeWaitMs))) {
      throw new ForgeUploadError('The image was uploaded but is still being reviewed. Try again in a minute.', 'provider_error');
    }
  }
  return url;
}
