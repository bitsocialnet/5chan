import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import FileUploader from '../../plugins/file-uploader';
import { uploadToCatbox } from '../../lib/utils/catbox-utils';
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
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockResolvedValue({
      url: 'https://files.catbox.moe/android.jpg',
      fileName: 'android.jpg',
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

  it('uploads via Electron file picker + catbox utility', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    window.electronApi = { isElectron: true } as any;
    vi.mocked(uploadToCatbox).mockResolvedValue('https://files.catbox.moe/electron.png');

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

    expect(uploadToCatbox).toHaveBeenCalledWith(selectedFile);
    expect(onUploadComplete).toHaveBeenCalledWith('https://files.catbox.moe/electron.png', 'electron.png');
    expect(hook().uploadedFileName).toBe('electron.png');
    expect(hook().isUploading).toBe(false);
  });

  it('shows web fallback alert and does not upload', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    window.electronApi = undefined;
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_not_supported_web');
    expect(uploadToCatbox).not.toHaveBeenCalled();
    expect(FileUploader.pickAndUploadMedia).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('silently ignores file selection cancellation', async () => {
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

    expect(uploadToCatbox).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });

  it('alerts on upload failure and resets uploading state', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(FileUploader.pickAndUploadMedia).mockRejectedValue(new Error('boom'));
    const { onUploadComplete, hook } = mountHook();

    await act(async () => {
      await hook().handleUpload();
    });

    expect(window.alert).toHaveBeenCalledWith('upload_failed: boom');
    expect(onUploadComplete).not.toHaveBeenCalled();
    expect(hook().isUploading).toBe(false);
  });
});
