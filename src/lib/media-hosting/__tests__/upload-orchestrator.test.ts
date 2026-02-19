import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orchestrateElectronUpload } from '../upload-orchestrator';
import { uploadToCatbox } from '../../utils/catbox-utils';

vi.mock('../../utils/catbox-utils', () => ({
  uploadToCatbox: vi.fn(),
}));

function createElectronApiMock() {
  return {
    isElectron: true,
    copyToClipboard: vi.fn(async () => ({ success: true })),
    getPlatform: vi.fn(async () => ({ platform: 'darwin' as NodeJS.Platform, arch: 'x64', version: 'v20.0.0' })),
    automateUploadMedia: vi.fn(async () => ({ url: 'https://i.imgur.com/abc.png', provider: 'imgur' as const })),
    getPathForFile: vi.fn((): string | null => '/tmp/image.png'),
  };
}

describe('orchestrateElectronUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronApi = undefined;
    window.isElectron = false;
  });

  it('uploads via catbox provider directly', async () => {
    vi.mocked(uploadToCatbox).mockResolvedValue('https://files.catbox.moe/a.png');
    const file = new File(['a'], 'a.png', { type: 'image/png' });

    const url = await orchestrateElectronUpload(file, ['catbox']);

    expect(url).toBe('https://files.catbox.moe/a.png');
    expect(uploadToCatbox).toHaveBeenCalledWith(file);
  });

  it('uses electronApi.getPathForFile when File.path is unavailable', async () => {
    const electronApi = createElectronApiMock();
    window.electronApi = electronApi;

    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const url = await orchestrateElectronUpload(file, ['imgur']);

    expect(url).toBe('https://i.imgur.com/abc.png');
    expect(electronApi.getPathForFile).toHaveBeenCalledWith(file);
    expect(electronApi.automateUploadMedia).toHaveBeenCalledWith({
      provider: 'imgur',
      filePath: '/tmp/image.png',
    });
  });

  it('fails with provider attempt details if no file path can be resolved', async () => {
    const electronApi = createElectronApiMock();
    electronApi.getPathForFile = vi.fn((): string | null => null);
    window.electronApi = electronApi;

    const file = new File(['z'], 'z.png', { type: 'image/png' });

    try {
      await orchestrateElectronUpload(file, ['postimages']);
      throw new Error('Expected orchestrateElectronUpload to throw');
    } catch (error) {
      const typedError = error as Error & {
        attempts?: Array<{ provider: string; error?: string }>;
      };
      expect(typedError.message).toBe('All providers failed');
      expect(typedError.attempts?.[0]?.provider).toBe('postimages');
      expect(typedError.attempts?.[0]?.error).toContain('File path required for Electron automation');
    }
  });
});
