import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgeUploadError, uploadToForge } from '../forge-utils';

const jsonResponse = (status: number, body: unknown, statusText = '') =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  }) as Response;

const apiError = (status: number, code: string, message: string) => jsonResponse(status, { error: { code, message } });

const getToken = vi.fn(async () => 'turnstile-token');

async function uploadError(file = new File(['x'], 'x.png', { type: 'image/png' })): Promise<ForgeUploadError> {
  const error = await uploadToForge(file, { getToken }).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ForgeUploadError);
  return error as ForgeUploadError;
}

describe('uploadToForge', () => {
  beforeEach(() => {
    getToken.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(['live', 'pending'])('returns the URL for a %s upload', async (status) => {
    const url = 'https://img.bitsocialforge.com/9f86d08/photo.png';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { url, sha256: '9f86d08', status }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadToForge(new File(['x'], 'photo.png', { type: 'image/png' }), { getToken })).resolves.toBe(url);
  });

  describe('pending images', () => {
    const url = 'http://127.0.0.1:3917/dev/media/abc/photo.png';
    let loadResults: boolean[];
    let loadedSrcs: string[];

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      referrerPolicy = '';
      set src(value: string) {
        loadedSrcs.push(value);
        const loaded = loadResults.shift() ?? false;
        queueMicrotask(() => (loaded ? this.onload?.() : this.onerror?.()));
      }
    }

    beforeEach(() => {
      vi.useFakeTimers();
      loadResults = [];
      loadedSrcs = [];
      vi.stubGlobal('Image', FakeImage);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { url, status: 'pending', mime: 'image/png' })));
    });

    it('waits until a pending image serves before returning its URL', async () => {
      loadResults = [false, false, true];
      let result: string | undefined;
      void uploadToForge(new File(['x'], 'photo.png', { type: 'image/png' }), { getToken }).then((value) => {
        result = value;
      });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(loadedSrcs).toEqual([url]);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(2_000 + 4_000);

      expect(loadedSrcs).toEqual([url, url, url]);
      expect(result).toBe(url);
    });

    it('returns the URL anyway once the bounded wait runs out', async () => {
      const pending = uploadToForge(new File(['x'], 'photo.png', { type: 'image/png' }), { getToken, pendingServeWaitMs: 10_000 });

      await vi.advanceTimersByTimeAsync(10_000);

      await expect(pending).resolves.toBe(url);
      expect(loadedSrcs.length).toBeGreaterThan(1);
    });

    it('does not wait for a live upload', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { url, status: 'live', mime: 'image/png' })));

      await expect(uploadToForge(new File(['x'], 'photo.png', { type: 'image/png' }), { getToken })).resolves.toBe(url);
      expect(loadedSrcs).toEqual([]);
    });
  });

  it('POSTs multipart with the turnstile field before the file part and no custom headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { url: 'https://img.bitsocialforge.com/abc.png', status: 'pending' }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'photo.png', { type: 'image/png' });

    await uploadToForge(file, { getToken });

    expect(getToken).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://img-api.bitsocialforge.com/api/upload');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect(Array.from(body.keys())).toEqual(['turnstile', 'file']);
    expect(body.get('turnstile')).toBe('turnstile-token');
    expect((body.get('file') as File).name).toBe('photo.png');
  });

  it('fails at the blocked stage without uploading when no Turnstile token is available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    getToken.mockRejectedValueOnce(new Error('Turnstile error 300030'));

    const error = await uploadError();

    expect(error.stage).toBe('blocked');
    expect(error.message).toBe('Turnstile check failed: Turnstile error 300030');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['turnstile_failed', 'missing or invalid Turnstile token'],
    ['banned', 'this IP or key is banned'],
  ])('maps 403 %s to the blocked stage', async (code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError(403, code, message)));

    const error = await uploadError();

    expect(error.stage).toBe('blocked');
    expect(error.message).toBe(message);
  });

  it.each([
    [400, 'bad_request', 'malformed request'],
    [413, 'too_large', 'file exceeds the 10485760-byte cap for its type and tier'],
    [415, 'unsupported_type', 'type not in allowlist'],
    [429, 'rate_limited', 'rate limit exceeded, retry later'],
    [451, 'blocked', 'this exact content is blocked'],
    [503, 'storage_unavailable', 'storage unreachable — uploads fail closed, retry later'],
  ])('maps %i %s to the provider_error stage with the API message', async (status, code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError(status, code, message)));

    const error = await uploadError();

    expect(error.stage).toBe('provider_error');
    expect(error.message).toBe(message);
  });

  it('falls back to the HTTP status for a non-JSON error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway', json: () => Promise.reject(new SyntaxError('Unexpected token <')) }),
    );

    const error = await uploadError();

    expect(error.stage).toBe('provider_error');
    expect(error.message).toBe('Upload failed: 502 Bad Gateway');
  });

  it('rejects a success response without a usable URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { url: 'javascript:alert(1)', status: 'live' })));

    const error = await uploadError();

    expect(error.stage).toBe('provider_error');
  });

  it('maps a network failure to the unknown stage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await uploadError();

    expect(error.stage).toBe('unknown');
    expect(error.message).toBe('Network error: Failed to fetch');
  });

  it('aborts a hung upload and maps it to the timeout stage', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = uploadToForge(new File(['x'], 'x.png', { type: 'image/png' }), { getToken, timeoutMs: 5_000 }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(5_000);
    const error = (await pending) as ForgeUploadError;

    expect(error).toBeInstanceOf(ForgeUploadError);
    expect(error.stage).toBe('timeout');
    expect(error.message).toBe('Upload timed out after 5s');
  });
});
