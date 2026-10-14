import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import FileUploader from '../../plugins/file-uploader';
import { ensureProviderAvailability } from '../../lib/media-hosting/provider-availability';
import { orchestrateUpload } from '../../lib/media-hosting/upload-orchestrator';
import { useFileUpload } from '../use-file-upload';
import type { AttachedMedia, UploadPhase } from '../../lib/media-hosting/types';

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
  default: { pickMedia: vi.fn(), uploadPickedMedia: vi.fn(), uploadGeneratedMedia: vi.fn() },
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
const setShowLinkFieldMock = vi.hoisted(() => vi.fn());
vi.mock('../../stores/use-media-hosting-store', () => ({
  default: (selector: (s: { uploadMode: string; preferredProvider: string; setShowLinkField: (showLinkField: boolean) => void }) => unknown) =>
    selector({ uploadMode: uploadModeRef.value, preferredProvider: preferredProviderRef.value, setShowLinkField: setShowLinkFieldMock }),
}));

type HookSnapshot = ReturnType<typeof useFileUpload>;

let latestHook: HookSnapshot | null = null;
let root: Root;
let container: HTMLDivElement;

const HookHarness = () => {
  latestHook = useFileUpload();
  return null;
};

const getHook = (): HookSnapshot => {
  if (!latestHook) {
    throw new Error('Hook is not mounted');
  }
  return latestHook;
};

const mountHook = () => {
  act(() => {
    root.render(createElement(HookHarness));
  });
  return getHook;
};

const selectFileFromHiddenInput = async (file: File | null) => {
  const picker = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(picker).not.toBeNull();
  Object.defineProperty(picker as HTMLInputElement, 'files', {
    configurable: true,
    value: file ? [file] : [],
  });

  await act(async () => {
    picker?.dispatchEvent(new Event(file ? 'change' : 'cancel'));
  });
};

const chooseViaInput = async (hook: () => HookSnapshot, file: File | null) => {
  let choosePromise: Promise<AttachedMedia | null> | undefined;
  await act(async () => {
    choosePromise = hook().chooseFile();
  });
  await selectFileFromHiddenInput(file);
  let chosen: AttachedMedia | null = null;
  await act(async () => {
    chosen = (await choosePromise) ?? null;
  });
  return chosen as AttachedMedia | null;
};

const upload = async (hook: () => HookSnapshot, media: AttachedMedia) => {
  let result: Awaited<ReturnType<HookSnapshot['uploadAttachment']>> = null;
  await act(async () => {
    result = await hook().uploadAttachment(media);
  });
  return result as Awaited<ReturnType<HookSnapshot['uploadAttachment']>>;
};

const fileMedia = (file: File): AttachedMedia => ({ kind: 'file', file, name: file.name, mimeType: file.type });
const pickedMedia: AttachedMedia = { kind: 'picked', id: 'picked-1', name: 'android.jpg', mimeType: 'image/jpeg' };

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

  describe('chooseFile', () => {
    it('only picks a file on web: nothing is probed or uploaded until submit', async () => {
      const hook = mountHook();
      const selectedFile = new File(['abc'], 'web.png', { type: 'image/png' });

      let choosePromise: Promise<AttachedMedia | null> | undefined;
      await act(async () => {
        choosePromise = hook().chooseFile();
      });
      const accept = (document.querySelector('input[type="file"]') as HTMLInputElement | null)?.accept.split(',');
      expect(accept).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/gif', 'image/webp', '.swf']));
      await selectFileFromHiddenInput(selectedFile);
      let chosen: AttachedMedia | null = null;
      await act(async () => {
        chosen = (await choosePromise) ?? null;
      });

      expect(chosen).toEqual({ kind: 'file', file: selectedFile, name: 'web.png', mimeType: 'image/png' });
      expect(ensureProviderAvailability).not.toHaveBeenCalled();
      expect(orchestrateUpload).not.toHaveBeenCalled();
      expect(hook().isUploading).toBe(false);
    });

    it('picks through the Electron picker without uploading', async () => {
      window.electronApi = { isElectron: true } as any;
      const hook = mountHook();
      const selectedFile = new File(['abc'], 'electron.png', { type: 'image/png' });

      expect(await chooseViaInput(hook, selectedFile)).toEqual(fileMedia(selectedFile));
      expect(orchestrateUpload).not.toHaveBeenCalled();
    });

    it('picks natively on Android and keeps only the opaque id', async () => {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.pickMedia).mockResolvedValue({ id: 'picked-1', fileName: 'android.jpg', mimeType: 'image/jpeg' });
      const hook = mountHook();

      let chosen: AttachedMedia | null = null;
      await act(async () => {
        chosen = await hook().chooseFile();
      });

      expect(chosen).toEqual(pickedMedia);
      expect(FileUploader.uploadPickedMedia).not.toHaveBeenCalled();
      expect(ensureProviderAvailability).not.toHaveBeenCalled();
    });

    it('returns null without alerting when the picker is cancelled', async () => {
      const hook = mountHook();
      expect(await chooseViaInput(hook, null)).toBeNull();

      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.pickMedia).mockRejectedValue(new Error('File selection cancelled'));
      let chosen: AttachedMedia | null = pickedMedia;
      await act(async () => {
        chosen = await hook().chooseFile();
      });

      expect(chosen).toBeNull();
      expect(window.alert).not.toHaveBeenCalled();
      expect(setShowLinkFieldMock).not.toHaveBeenCalled();
    });

    it('alerts a picker failure without treating it as a failed upload', async () => {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.pickMedia).mockRejectedValue(new Error('No URI received'));
      const hook = mountHook();

      await act(async () => {
        await hook().chooseFile();
      });

      expect(window.alert).toHaveBeenCalledWith('error: No URI received');
      expect(setShowLinkFieldMock).not.toHaveBeenCalled();
    });

    it('does not open a picker when uploads are turned off', async () => {
      uploadModeRef.value = 'none';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      const hook = mountHook();

      await act(async () => {
        expect(await hook().chooseFile()).toBeNull();
      });

      expect(FileUploader.pickMedia).not.toHaveBeenCalled();
      expect(document.querySelector('input[type="file"]')).toBeNull();
    });
  });

  describe('uploadAttachment', () => {
    it('uploads a web file to forge under the default settings', async () => {
      vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://forgeimg.net/abc/web.png' });
      const file = new File(['abc'], 'web.png', { type: 'image/png' });
      const hook = mountHook();

      expect(await upload(hook, fileMedia(file))).toEqual({ url: 'https://forgeimg.net/abc/web.png', fileName: 'web.png' });
      expect(orchestrateUpload).toHaveBeenCalledWith(file, ['forge'], expect.any(Function));
      expect(window.alert).not.toHaveBeenCalled();
      expect(hook().isUploading).toBe(false);
    });

    it('returns the link and tells the uploader when the host holds the file for review', async () => {
      vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://forgeimg.net/abc/game.swf', awaitingReview: true });
      const file = new File(['FWS'], 'game.swf', { type: 'application/x-shockwave-flash' });
      const hook = mountHook();

      expect(await upload(hook, fileMedia(file))).toEqual({ url: 'https://forgeimg.net/abc/game.swf', fileName: 'game.swf' });
      expect(window.alert).toHaveBeenCalledWith('upload_awaiting_review');
    });

    it('reports the upload phase while the upload runs', async () => {
      let resolveUpload: (value: { url: string }) => void = () => undefined;
      let reportPhase: ((phase: UploadPhase) => void) | undefined;
      vi.mocked(orchestrateUpload).mockImplementationOnce(
        (_file, _order, onPhaseChange) =>
          new Promise((resolve) => {
            resolveUpload = resolve;
            reportPhase = onPhaseChange;
          }),
      );
      const hook = mountHook();

      let uploadPromise: Promise<unknown> | undefined;
      await act(async () => {
        uploadPromise = hook().uploadAttachment(fileMedia(new File(['abc'], 'slow.png', { type: 'image/png' })));
      });
      expect(hook()).toMatchObject({ isUploading: true, uploadPhase: 'uploading' });

      await act(async () => {
        reportPhase?.('checking');
      });
      expect(hook()).toMatchObject({ isUploading: true, uploadPhase: 'checking' });

      await act(async () => {
        resolveUpload({ url: 'https://forgeimg.net/abc/slow.png' });
        await uploadPromise;
      });
      expect(hook()).toMatchObject({ isUploading: false, uploadPhase: null });
    });

    it('uploads an Electron file through the orchestrator', async () => {
      uploadModeRef.value = 'preferred';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
      window.electronApi = { isElectron: true } as any;
      vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://files.catbox.moe/electron.png' });
      const file = new File(['abc'], 'electron.png', { type: 'image/png' });
      const hook = mountHook();

      expect(await upload(hook, fileMedia(file))).toEqual({ url: 'https://files.catbox.moe/electron.png', fileName: 'electron.png' });
      expect(orchestrateUpload).toHaveBeenCalledWith(file, ['catbox'], expect.any(Function));
    });

    it('treats runtime as Electron when window.isElectron is true even if electronApi is unavailable', async () => {
      uploadModeRef.value = 'preferred';
      window.isElectron = true;
      vi.mocked(orchestrateUpload).mockResolvedValue({ url: 'https://files.catbox.moe/electron-fallback.png' });
      const file = new File(['abc'], 'electron-fallback.png', { type: 'image/png' });
      const hook = mountHook();

      await upload(hook, fileMedia(file));

      expect(orchestrateUpload).toHaveBeenCalledWith(file, ['catbox'], expect.any(Function));
      expect(window.alert).not.toHaveBeenCalled();
    });

    it('uploads a natively picked Android file by its id', async () => {
      uploadModeRef.value = 'preferred';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.uploadPickedMedia).mockResolvedValue({ url: 'https://files.catbox.moe/android.jpg', fileName: 'android.jpg', provider: 'catbox' });
      const hook = mountHook();

      expect(await upload(hook, pickedMedia)).toEqual({ url: 'https://files.catbox.moe/android.jpg', fileName: 'android.jpg' });
      expect(FileUploader.uploadPickedMedia).toHaveBeenCalledWith({ id: 'picked-1', providerOrder: ['catbox'] });
      expect(FileUploader.uploadGeneratedMedia).not.toHaveBeenCalled();
    });

    it('passes the whole random provider order to Android', async () => {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.uploadPickedMedia).mockResolvedValue({ url: 'https://files.catbox.moe/random.jpg', fileName: 'random.jpg', provider: 'catbox' });
      const hook = mountHook();

      await upload(hook, pickedMedia);

      const call = vi.mocked(FileUploader.uploadPickedMedia).mock.calls[0][0];
      expect([...call.providerOrder].sort()).toEqual(['catbox', 'imgbb', 'imgur']);
    });

    it.each([
      ['imgbb', 'https://i.ibb.co/example/android.png'],
      ['imgur', 'https://i.imgur.com/example.png'],
    ] as const)('uploads to only %s on Android when it is the preferred provider', async (provider, url) => {
      uploadModeRef.value = 'preferred';
      preferredProviderRef.value = provider;
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.uploadPickedMedia).mockResolvedValue({ url, fileName: 'android.png', provider });
      const hook = mountHook();

      expect((await upload(hook, pickedMedia))?.url).toBe(url);
      expect(FileUploader.uploadPickedMedia).toHaveBeenCalledWith({ id: 'picked-1', providerOrder: [provider] });
    });

    it('uploads a generated Android file through the base64 path', async () => {
      uploadModeRef.value = 'preferred';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.uploadGeneratedMedia).mockResolvedValue({
        url: 'https://files.catbox.moe/android-tegaki.png',
        fileName: 'tegaki.png',
        provider: 'catbox',
      });
      const file = new File(['abc'], 'tegaki.png', { type: 'image/png' });
      const hook = mountHook();

      expect(await upload(hook, fileMedia(file))).toEqual({ url: 'https://files.catbox.moe/android-tegaki.png', fileName: 'tegaki.png' });
      expect(FileUploader.uploadGeneratedMedia).toHaveBeenCalledWith({
        providerOrder: ['catbox'],
        fileName: 'tegaki.png',
        mimeType: 'image/png',
        base64: 'YWJj',
      });
    });

    it('alerts a preferred-mode failure with guidance and reveals the link field', async () => {
      uploadModeRef.value = 'preferred';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      vi.mocked(FileUploader.uploadPickedMedia).mockRejectedValue(new Error('boom'));
      const hook = mountHook();

      expect(await upload(hook, pickedMedia)).toBeNull();
      expect(window.alert).toHaveBeenCalledWith('upload_failed: boom. upload_failed_preferred_guidance');
      expect(setShowLinkFieldMock).toHaveBeenCalledWith(true);
      expect(hook().isUploading).toBe(false);
    });

    it('surfaces Android rejection attempts in the alert', async () => {
      uploadModeRef.value = 'preferred';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      const rejection = new Error('All providers failed: catbox: timeout') as Error & { data?: { attempts?: unknown[] } };
      rejection.data = { attempts: [{ provider: 'catbox', error: 'timeout', stage: 'timeout', elapsedMs: 5000 }] };
      vi.mocked(FileUploader.uploadPickedMedia).mockRejectedValue(rejection);
      const hook = mountHook();

      await upload(hook, pickedMedia);

      expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: catbox: timeout (stage=timeout, 5000ms)');
    });

    it('lists every failed Android provider and its stage', async () => {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      const rejection = new Error('All providers failed') as Error & { data: { attempts: unknown[] } };
      rejection.data = {
        attempts: [
          { provider: 'catbox', error: 'timeout' },
          { provider: 'imgbb', error: 'rate limit' },
          { provider: 'imgur', success: false, error: 'Provider error: CREATE_ALBUM_FAIL', stage: 'provider_error', elapsedMs: 2200, matchedSelectors: '#file-input' },
          { provider: 'not-a-provider', error: 'ignored' },
        ],
      };
      vi.mocked(FileUploader.uploadPickedMedia).mockRejectedValue(rejection);
      const hook = mountHook();

      await upload(hook, pickedMedia);

      expect(window.alert).toHaveBeenCalledWith(
        'upload_failed. upload_failed_all_providers: catbox: timeout; imgbb: rate limit; imgur: Provider error: CREATE_ALBUM_FAIL (stage=provider_error, 2200ms, tried=[#file-input])',
      );
      expect(setShowLinkFieldMock).toHaveBeenCalledWith(true);
    });

    it('keeps Android attempts for every registry provider in aggregated errors', async () => {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      const rejection = new Error('All providers failed') as Error & { data: { attempts: unknown[] } };
      rejection.data = { attempts: [{ provider: 'forge', error: 'blocked', stage: 'blocked' }] };
      vi.mocked(FileUploader.uploadPickedMedia).mockRejectedValue(rejection);
      const hook = mountHook();

      await upload(hook, pickedMedia);

      expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: forge: blocked (stage=blocked)');
    });

    it('shows the generic no-providers error on web when forge is unreachable', async () => {
      providerAvailabilityRef.value = { forge: 'unavailable' };
      const hook = mountHook();

      expect(await upload(hook, fileMedia(new File(['abc'], 'web.png', { type: 'image/png' })))).toBeNull();
      expect(window.alert).toHaveBeenCalledWith('upload_failed: No reachable upload providers are available from this network');
      expect(setShowLinkFieldMock).toHaveBeenCalledWith(true);
      expect(orchestrateUpload).not.toHaveBeenCalled();
    });

    it('shows the unsupported-provider error when the preferred provider is not available on web', async () => {
      uploadModeRef.value = 'preferred';
      preferredProviderRef.value = 'imgur';
      const hook = mountHook();

      await upload(hook, fileMedia(new File(['abc'], 'web.png', { type: 'image/png' })));

      expect(window.alert).toHaveBeenCalledWith('upload_failed: imgur is not supported on web. upload_failed_preferred_guidance');
      expect(orchestrateUpload).not.toHaveBeenCalled();
    });

    it.each([
      ['preferred', 'imgur', { imgur: 'unavailable' }, 'upload_failed: imgur is unavailable from this network. upload_failed_preferred_guidance'],
      ['preferred', 'imgbb', { imgbb: 'unavailable' }, 'upload_failed: imgbb is unavailable from this network. upload_failed_preferred_guidance'],
      [
        'random',
        'catbox',
        { catbox: 'unavailable', imgur: 'unavailable', imgbb: 'unavailable' },
        'upload_failed: No reachable upload providers are available from this network',
      ],
    ] as const)('does not call the Android plugin in %s mode when %s is unreachable', async (mode, provider, availability, message) => {
      uploadModeRef.value = mode;
      preferredProviderRef.value = provider;
      providerAvailabilityRef.value = { ...availability };
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      const hook = mountHook();

      expect(await upload(hook, pickedMedia)).toBeNull();
      expect(FileUploader.uploadPickedMedia).not.toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(message);
    });

    it('fails an attachment left over after uploads were turned off', async () => {
      uploadModeRef.value = 'none';
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
      const hook = mountHook();

      expect(await upload(hook, pickedMedia)).toBeNull();
      expect(FileUploader.uploadPickedMedia).not.toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith('upload_failed: Uploads are turned off in the media hosting settings');
    });

    it('random mode: all Electron providers failing shows the aggregated alert', async () => {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
      window.electronApi = { isElectron: true } as any;
      const err = new Error('All providers failed') as Error & { attempts: { provider: string; error: string }[] };
      err.attempts = [
        { provider: 'catbox', error: 'timeout' },
        { provider: 'imgur', error: 'rate limit' },
        { provider: 'imgbb', error: 'blocked' },
      ];
      vi.mocked(orchestrateUpload).mockRejectedValue(err);
      const hook = mountHook();

      expect(await upload(hook, fileMedia(new File(['x'], 'fail.png', { type: 'image/png' })))).toBeNull();
      expect(window.alert).toHaveBeenCalledWith('upload_failed. upload_failed_all_providers: catbox: timeout; imgur: rate limit; imgbb: blocked');
      expect(hook().isUploading).toBe(false);
    });
  });
});
