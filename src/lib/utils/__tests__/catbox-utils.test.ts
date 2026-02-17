import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadToCatbox } from '../catbox-utils';

describe('uploadToCatbox', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs file to catbox API and returns trimmed URL', async () => {
    const mockFile = new File(['content'], 'test.png', { type: 'image/png' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('  https://files.catbox.moe/abc123.png  '),
      }),
    );

    const url = await uploadToCatbox(mockFile);
    expect(url).toBe('https://files.catbox.moe/abc123.png');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://catbox.moe/user/api.php');
    expect(call[1]?.method).toBe('POST');
    const body = call[1]?.body as FormData;
    expect(body.get('reqtype')).toBe('fileupload');
    expect(body.get('fileToUpload')).toBe(mockFile);
  });

  it('throws Error on non-ok response', async () => {
    const mockFile = new File(['x'], 'x.txt', { type: 'text/plain' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await expect(uploadToCatbox(mockFile)).rejects.toThrow('Upload failed: 500 Internal Server Error');
  });

  it('throws when fetch rejects with a network error', async () => {
    const mockFile = new File(['x'], 'x.txt', { type: 'text/plain' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    await expect(uploadToCatbox(mockFile)).rejects.toThrow('Network down');
  });
});
