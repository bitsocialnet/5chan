import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadToCatbox } = vi.hoisted(() => ({ uploadToCatbox: vi.fn() }));
vi.mock('../../utils/catbox-utils', () => ({ uploadToCatbox }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doMock('../../utils/forge-utils', () => {
    throw new Error('Forge chunk failed to download');
  });
  uploadToCatbox.mockResolvedValue('https://files.catbox.moe/fallback.png');
});

afterEach(() => vi.doUnmock('../../utils/forge-utils'));

describe('Forge adapter loading', () => {
  it('retains provider fallback when no posting authorization is required', async () => {
    const { orchestrateUpload } = await import('../upload-orchestrator');
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    await expect(orchestrateUpload(file, ['forge', 'catbox'])).resolves.toEqual({ url: 'https://files.catbox.moe/fallback.png' });
    expect(uploadToCatbox).toHaveBeenCalledWith(file);
  });

  it('stops before any other upload when required posting authorization cannot load', async () => {
    const { orchestrateUpload } = await import('../upload-orchestrator');
    const authorize = vi.fn();
    await expect(orchestrateUpload(new File(['x'], 'x.png', { type: 'image/png' }), ['forge', 'catbox'], undefined, authorize)).rejects.toMatchObject({
      name: 'SpamBlockerAuthorizationError',
      message: 'Could not load upload checks. Try again.',
    });
    expect(authorize).not.toHaveBeenCalled();
    expect(uploadToCatbox).not.toHaveBeenCalled();
  });
});
