import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import FileUploader from '../../plugins/file-uploader';
import { orchestrateElectronUpload } from '../../lib/media-hosting/upload-orchestrator';
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
  default: { pickAndUploadMedia: vi.fn() },
}));

vi.mock('../../lib/utils/catbox-utils', () => ({
  uploadToCatbox: vi.fn(),
}));

vi.mock('../../lib/media-hosting/upload-orchestrator', () => ({
  orchestrateElectronUpload: vi.fn(),
}));

vi.mock('../../lib/media-hosting/provider-order', () => ({
  getProviderOrder: vi.fn((opts: { mode: string; preferredProvider: string; runtime: string }) => {
    if (opts.mode === 'none') return [];
    if (opts.runtime === 'web') return opts.preferredProvider === 'catbox' ? ['catbox'] : [];
    return opts.mode === 'preferred' ? [opts.preferredProvider] : ['catbox', 'imgur', 'postimages'];
  }),
}));

const uploadModeRef = vi.hoisted(() => ({ value: 'random' as 'random' | 'preferred' | 'none' }));
const preferredProviderRef = vi.hoisted(() => ({ value: 'catbox' as 'catbox' | 'imgur' | 'postimages' }));
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
    latestHook = null;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    window.electronApi = undefined;
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
    vi.mocked(orchestrateElectronUpload).mockResolvedValue('https://files.catbox.moe/electron.png');

    const selectedFile = new File(['abc'], 'electron.png', { type: 'image/png' });
    const { onUploadComplete, hook } = mountHook();

    let uploadPromise: Promise<void> | undefined;
    await act(async () => {
      uploadPromise = hook().handleUpload();
    });
    await selectFileFromHiddenInput(selectedFile);
    await act(async () => {
      await uploadPromise;
    });

    expect(orchestrateElectronUpload).toHaveBeenCalledWith(selectedFile, ['catbox']);
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/electron.png', 'electron.png');
    expect(hook().uploadedFileName).toBe('electron.png');
    expect(hook().isUploading).toBe(false);
  });

  it('shows web fallback alert and does not upload', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    window.electronApi = undefined;
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_not_supported_web');
    expect(orchestrateElectronUpload).not.toHaveBeenCalled();
    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
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

    expect(orchestrateElectronUpload).not.toHaveBeenCalled();
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

  it('shows web unsupported alert when preferred provider not available on web', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgur';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_not_supported_web');
    expect(orchestrateElectronUpload).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
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
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/random.jpg', 'random.jpg');
  });

  it('random mode: Electron upload succeeds when orchestrator resolves', async () => {
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    window.electronApi = { isElectron: true } as any;
    vi.mocked(orchestrateElectronUpload).mockResolvedValue('https://imgur.com/abc');

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

    expect(orchestrateElectronUpload).toHaveBeenCalledWith(selectedFile, expect.any(Array));
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
    ];
    vi.mocked(orchestrateElectronUpload).mockRejectedValue(err);

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

    expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: catbox: timeout; imgur: rate limit');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });
});
