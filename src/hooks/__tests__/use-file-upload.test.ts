import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import FileUploader from '../../plugins/file-uploader';
import { ensureProviderAvailability } from '../../lib/media-hosting/provider-availability';
import { orchestrateUpload } from '../../lib/media-hosting/upload-orchestrator';
import { useFileUpload } from '../use-file-upload';

// Enable React's act environment for hook state updates in tests.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as any).act as (callback: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: vi.fn(() => 'web') },
}));

vi.mock('../../plugins/file-uploader', () => ({
  default: { pickAndUploadMedia: vi.fn(), uploadGeneratedMedia: vi.fn() },
}));

vi.mock('../../lib/utils/catbox-utils', () => ({
  uploadToCatbox: vi.fn(),
}));

vi.mock('../../lib/media-hosting/upload-orchestrator', () => ({
  orchestrateUpload: vi.fn(),
}));

const providerAvailabilityRef = vi.hoisted(() => ({
  value: {} as Record<string, 'unknown' | 'checking' | 'available' | 'unavailable'>,
}));
vi.mock('../../lib/media-hosting/provider-availability', () => ({
  ensureProviderAvailability: vi.fn(async () => providerAvailabilityRef.value),
}));

vi.mock('../../lib/media-hosting/provider-order', () => ({
  getProviderOrder: vi.fn((opts: { mode: string; preferredProvider: string; runtime: string; availability?: Record<string, string> }) => {
    const filterAvailable = (providers: string[]) => providers.filter((provider) => opts.availability?.[provider] !== 'unavailable');
    if (opts.mode === 'none') return [];
    if (opts.runtime === 'web') {
      if (opts.mode === 'preferred') return filterAvailable(opts.preferredProvider === 'forge' ? ['forge'] : []);
      return filterAvailable(['forge']);
    }
    if (opts.runtime === 'android') {
      if (opts.mode === 'preferred') return filterAvailable(['catbox', 'imgur', 'imgbb'].includes(opts.preferredProvider) ? [opts.preferredProvider] : []);
      return filterAvailable(['catbox', 'imgur', 'imgbb']);
    }
    return filterAvailable(opts.mode === 'preferred' ? [opts.preferredProvider] : ['catbox', 'imgur', 'imgbb']);
  }),
}));

const uploadModeRef = vi.hoisted(() => ({ value: 'random' as 'random' | 'preferred' | 'none' }));
const preferredProviderRef = vi.hoisted(() => ({ value: 'catbox' as 'forge' | 'catbox' | 'imgur' | 'imgbb' }));
vi.mock('../../stores/use-media-hosting-store', () => ({
  default: (selector: (s: { uploadMode: string; preferredProvider: string }) => unknown) =>
    selector({ uploadMode: uploadModeRef.value, preferredProvider: preferredProviderRef.value }),
}));

type HookSnapshot = ReturnType<typeof useFileUpload>;

let latestHook: HookSnapshot | null = null;
let root: Root;
let container: HTMLDivElement;

const HookHarness = ({ onUploadComplete }: { onUploadComplete: (url: string, fileName: string) => void }) => {
  latestHook = useFileUpload({ onUploadComplete });
  return null;
};

const getHook = (): HookSnapshot => {
  if (!latestHook) {
    throw new Error('Hook is not mounted');
  }
  return latestHook;
};

const mountHook = (onUploadComplete = vi.fn()) => {
  act(() => {
    root.render(createElement(HookHarness, { onUploadComplete }));
  });
  return { onUploadComplete, hook: getHook };
};

const selectFileFromHiddenInput = async (file: File | null) => {
  const picker = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(picker).not.toBeNull();
  Object.defineProperty(picker as HTMLInputElement, 'files', {
    configurable: true,
    value: file ? [file] : [],
  });

  await act(async () => {
    picker?.dispatchEvent(new Event('change'));
  });
};

describe('useFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    providerAvailabilityRef.value = {};
    latestHook = null;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    window.electronApi = undefined;
    window.isElectron = false;
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('uploads via Android plugin and updates state', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockResolvedValue({
      url: 'https://files.catbox.moe/android.jpg',
      fileName: 'android.jpg',
      provider: 'catbox',
    });

    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).toHaveBeenCalledOnce();
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/android.jpg', 'android.jpg');
    expect(hook().uploadedFileName).toBe('android.jpg');
    expect(hook().isUploading).toBe(false);
  });

  it('uploads via Electron file picker + orchestrator', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    window.electronApi = { isElectron: true } as any;
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://files.catbox.moe/electron.png' });

    const selectedFile = new File(['abc'], 'electron.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    expect((document.querySelector('input[type="file"]') as HTMLInputElement | null)?.accept).toContain('.swf');
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(selectedFile, ['catbox']);
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/electron.png', 'electron.png');
    expect(hook().uploadedFileName).toBe('electron.png');
    expect(hook().isUploading).toBe(false);
  });

  it('treats runtime as Electron when window.isElectron is true even if electronApi is unavailable', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    window.electronApi = undefined;
    window.isElectron = true;
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://files.catbox.moe/electron-fallback.png' });

    const selectedFile = new File(['abc'], 'electron-fallback.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(selectedFile, ['catbox']);
    expect(window.alert).not.toHaveBeenCalled();
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/electron-fallback.png', 'electron-fallback.png');
  });

  it('uploads via web file picker + orchestrator with forge under the default settings', async () => {
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://img.bitsocialforge.com/abc/web.png' });

    const selectedFile = new File(['abc'], 'web.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    const accept = (document.querySelector('input[type="file"]') as HTMLInputElement | null)?.accept.split(',');
    expect(accept).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/gif', 'image/webp']));
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(selectedFile, ['forge']);
    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(onUploadComplete).toHaveBeenCalledWith('https://img.bitsocialforge.com/abc/web.png', 'web.png');
    expect(hook().uploadedFileName).toBe('web.png');
    expect(hook().isUploading).toBe(false);
  });

  it('inserts the link and tells the uploader when the host holds the file for review', async () => {
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://img.bitsocialforge.com/abc/game.swf', awaitingReview: true });

    const selectedFile = new File(['FWS'], 'game.swf', { type: 'application/x-shockwave-flash' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(onUploadComplete).toHaveBeenCalledWith('https://img.bitsocialforge.com/abc/game.swf', 'game.swf');
    expect(window.alert).toHaveBeenCalledWith('upload_awaiting_review');
    expect(hook().isUploading).toBe(false);
  });

  it('opens the web file picker before provider availability resolves', async () => {
    let resolveAvailability: (value: Record<string, string>) => void = () => undefined;
    vi.mocked(ensureProviderAvailability).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAvailability = resolve;
        }),
    );
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://img.bitsocialforge.com/abc/early.png' });
    const selectedFile = new File(['abc'], 'early.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    await selectFileFromHiddenInput(selectedFile);
    expect(orchestrateUpload).not.toHaveBeenCalled();

    await act(async () => {
      resolveAvailability({});
      await uploadPromise;
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(selectedFile, ['forge']);
    expect(onUploadComplete).toHaveBeenCalledWith('https://img.bitsocialforge.com/abc/early.png', 'early.png');
  });

  it('shows the generic no-providers error on web when forge is unreachable', async () => {
    providerAvailabilityRef.value = { forge: 'unavailable' };
    const selectedFile = new File(['abc'], 'web.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed: No reachable upload providers are available from this network');
    expect(orchestrateUpload).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('stays silent when the web picker is cancelled even if no provider is reachable', async () => {
    providerAvailabilityRef.value = { forge: 'unavailable' };
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(null);
    await act(async () => {
      await uploadPromise;
    });

    expect(window.alert).not.toHaveBeenCalled();
    expect(orchestrateUpload).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('uploads a generated file via Electron orchestrator', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    window.electronApi = { isElectron: true } as any;
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://files.catbox.moe/tegaki.png' });

    const file = new File(['abc'], 'tegaki.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let result: Awaited<ReturnType<HookSnapshot['uploadFile']>> | null = null;
    await act(async () => {
      result = await hook().uploadFile(file);
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(file, ['catbox']);
    expect(result).toEqual({ url: 'https://files.catbox.moe/tegaki.png', fileName: 'tegaki.png' });
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/tegaki.png', 'tegaki.png');
    expect(hook().uploadedFileName).toBe('tegaki.png');
    expect(hook().isUploading).toBe(false);
  });

  it('uploads a generated file via Android plugin', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.uploadGeneratedMedia).mockResolvedValue({
      url: 'https://files.catbox.moe/android-tegaki.png',
      fileName: 'tegaki.png',
      provider: 'catbox',
    });

    const file = new File(['abc'], 'tegaki.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let result: Awaited<ReturnType<HookSnapshot['uploadFile']>> | null = null;
    await act(async () => {
      result = await hook().uploadFile(file);
    });

    expect(FileUploader.uploadGeneratedMedia).toHaveBeenCalledWith({
      providerOrder: ['catbox'],
      fileName: 'tegaki.png',
      mimeType: 'image/png',
      base64: 'YWJj',
    });
    expect(result).toEqual({ url: 'https://files.catbox.moe/android-tegaki.png', fileName: 'tegaki.png' });
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/android-tegaki.png', 'tegaki.png');
    expect(hook().uploadedFileName).toBe('tegaki.png');
  });

  it('uploads a generated file via the orchestrator on web', async () => {
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://img.bitsocialforge.com/abc/tegaki.png' });
    const file = new File(['abc'], 'tegaki.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let result: Awaited<ReturnType<HookSnapshot['uploadFile']>> | null = null;
    await act(async () => {
      result = await hook().uploadFile(file);
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(file, ['forge']);
    expect(FileUploader.uploadGeneratedMedia).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'https://img.bitsocialforge.com/abc/tegaki.png', fileName: 'tegaki.png' });
    expect(onUploadComplete).toHaveBeenCalledWith('https://img.bitsocialforge.com/abc/tegaki.png', 'tegaki.png');
  });

  it('silently ignores file selection cancellation', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    window.electronApi = { isElectron: true } as any;
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(null);
    await act(async () => {
      await uploadPromise;
    });

    expect(orchestrateUpload).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('alerts on preferred mode upload failure with actionable guidance', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockRejectedValue(new Error('boom'));
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed: boom. upload_failed_preferred_guidance');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('surfaces Android Capacitor rejection attempts in user-visible alert (preferred mode)', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const capacitorRejection = new Error('All providers failed: catbox: timeout') as Error & {
      data?: { attempts?: { provider: string; error: string; stage?: string; elapsedMs?: number }[] };
    };
    capacitorRejection.data = {
      attempts: [{ provider: 'catbox', error: 'timeout', stage: 'timeout', elapsedMs: 5000 }],
    };
    vi.mocked(FileUploader.pickAndUploadMedia).mockRejectedValue(capacitorRejection);
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: catbox: timeout (stage=timeout, 5000ms)');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('surfaces Android rejection with multiple provider attempts in alert', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const capacitorRejection = new Error('All providers failed') as Error & {
      data?: { attempts?: { provider: string; error: string }[] };
    };
    capacitorRejection.data = {
      attempts: [
        { provider: 'catbox', error: 'timeout' },
        { provider: 'imgbb', error: 'rate limit' },
      ],
    };
    vi.mocked(FileUploader.pickAndUploadMedia).mockRejectedValue(capacitorRejection);
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: catbox: timeout; imgbb: rate limit');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('returns early when uploadMode is none (no upload, no alert)', async () => {
    uploadModeRef.value = 'none';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockResolvedValue({
      url: 'https://files.catbox.moe/skip.jpg',
      fileName: 'skip.jpg',
      provider: 'catbox',
    });
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('shows the unsupported-provider error when the preferred provider is not available on web', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgur';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    const file = new File(['abc'], 'web.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().uploadFile(file);
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed: imgur is not supported on web. upload_failed_preferred_guidance');
    expect(orchestrateUpload).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('keeps Android attempts for every registry provider in aggregated errors', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const error = new Error('All providers failed') as Error & { data: { attempts: unknown[] } };
    error.data = {
      attempts: [
        { provider: 'forge', error: 'blocked', stage: 'blocked' },
        { provider: 'not-a-provider', error: 'ignored' },
      ],
    };
    vi.mocked(FileUploader.pickAndUploadMedia).mockRejectedValue(error);
    const { hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: forge: blocked (stage=blocked)');
  });

  it('does not call Android plugin when preferred Imgur is unavailable from this network', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgur';
    providerAvailabilityRef.value = { imgur: 'unavailable' };
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('upload_failed: imgur is unavailable from this network. upload_failed_preferred_guidance');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('does not call Android plugin when preferred provider is unavailable from this network', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgbb';
    providerAvailabilityRef.value = { imgbb: 'unavailable' };
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('upload_failed: imgbb is unavailable from this network. upload_failed_preferred_guidance');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('does not call Android plugin when random mode has no reachable providers', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    providerAvailabilityRef.value = { catbox: 'unavailable', imgur: 'unavailable', imgbb: 'unavailable' };
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('upload_failed: No reachable upload providers are available from this network');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('calls Android plugin with only ImgBB when ImgBB is chosen', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgbb';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockResolvedValue({
      url: 'https://i.ibb.co/example/android.png',
      fileName: 'android.png',
      provider: 'imgbb',
    });
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).toHaveBeenCalledWith({ providerOrder: ['imgbb'] });
    expect(onUploadComplete).toHaveBeenCalledWith('https://i.ibb.co/example/android.png', 'android.png');
  });

  it('calls Android plugin with only Imgur when Imgur is chosen and reachable', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgur';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockResolvedValue({
      url: 'https://i.imgur.com/example.png',
      fileName: 'android.png',
      provider: 'imgur',
    });
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).toHaveBeenCalledWith({ providerOrder: ['imgur'] });
    expect(onUploadComplete).toHaveBeenCalledWith('https://i.imgur.com/example.png', 'android.png');
  });

  it('Android call includes provider order payload', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockResolvedValue({
      url: 'https://files.catbox.moe/random.jpg',
      fileName: 'random.jpg',
      provider: 'catbox',
    });

    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(FileUploader.pickAndUploadMedia).toHaveBeenCalledWith({
      providerOrder: expect.any(Array),
    });
    const call = vi.mocked(FileUploader.pickAndUploadMedia).mock.calls[0][0];
    expect(call?.providerOrder).toEqual(expect.arrayContaining(['catbox']));
    expect(call?.providerOrder).toEqual(expect.arrayContaining(['imgbb']));
    expect(call?.providerOrder).toEqual(expect.arrayContaining(['imgur']));
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/random.jpg', 'random.jpg');
  });

  it('surfaces Android provider errors with their stage', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    const error = new Error('All providers failed') as Error & { data: { attempts: unknown[] } };
    error.data = {
      attempts: [
        {
          provider: 'imgur',
          success: false,
          error: 'Provider error: CREATE_ALBUM_FAIL',
          stage: 'provider_error',
          elapsedMs: 2200,
          matchedSelectors: '#file-input',
        },
      ],
    };
    vi.mocked(FileUploader.pickAndUploadMedia).mockRejectedValue(error);
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith(
      'upload_failed. upload_failed_all_providers: imgur: Provider error: CREATE_ALBUM_FAIL (stage=provider_error, 2200ms, tried=[#file-input])',
    );
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it('random mode: Electron upload succeeds when orchestrator resolves', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    window.electronApi = { isElectron: true } as any;
    vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://imgur.com/abc' });

    const selectedFile = new File(['xyz'], 'pic.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(orchestrateUpload).toHaveBeenCalledWith(selectedFile, expect.any(Array));
    expect(onUploadComplete).toHaveBeenCalledWith('https://imgur.com/abc', 'pic.png');
    expect(hook().isUploading).toBe(false);
  });

  it('random mode: all providers fail shows aggregated alert', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    window.electronApi = { isElectron: true } as any;
    const err = new Error('All providers failed') as Error & { attempts: { provider: string; error: string }[] };
    err.attempts = [
      { provider: 'catbox', error: 'timeout' },
      { provider: 'imgur', error: 'rate limit' },
      { provider: 'imgbb', error: 'blocked' },
    ];
    vi.mocked(orchestrateUpload).mockRejectedValue(err);

    const selectedFile = new File(['x'], 'fail.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: catbox: timeout; imgur: rate limit; imgbb: blocked');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });
});
