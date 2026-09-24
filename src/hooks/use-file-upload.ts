import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FileUploader from '../plugins/file-uploader';
import { formatAggregatedError, formatPreferredModeError, type ProviderAttempt } from '../lib/media-hosting/error-format';
import { getProviderOrder } from '../lib/media-hosting/provider-order';
import { getMediaHostingRuntime } from '../lib/media-hosting/show-upload-controls';
import { MEDIA_HOSTING_PROVIDERS } from '../lib/media-hosting/providers';
import { orchestrateUpload } from '../lib/media-hosting/upload-orchestrator';
import { stripMediaMetadata } from '../lib/media-metadata/strip-media-metadata';
import { ensureProviderAvailability } from '../lib/media-hosting/provider-availability';
import { selectFileViaInput } from '../lib/utils/file-picker-utils';
import useMediaHostingStore from '../stores/use-media-hosting-store';
import type { ProviderId, UploadAttemptStage } from '../lib/media-hosting/types';

/** Maps Android plugin stage strings to UploadAttemptStage (avoids unsafe cast). Includes pass-through for valid stages. */
const ANDROID_STAGE_MAP: Record<string, UploadAttemptStage> = {
  input_not_found: 'file_input',
  chooser_not_triggered: 'file_input',
  upload_timed_out: 'timeout',
  blocked_detected: 'blocked',
  provider_error: 'provider_error',
  no_recipe: 'unknown',
  page_loaded: 'page_load',
  blocked: 'blocked',
  file_input: 'file_input',
  submit: 'submit',
  timeout: 'timeout',
  page_load: 'page_load',
  unknown: 'unknown',
};

const FILE_SELECTION_CANCELLED_ERROR = 'File selection cancelled';

/** Derived from the registry so a new provider's Android attempts are never dropped from error aggregation. */
const VALID_PROVIDERS: ReadonlySet<string> = new Set(MEDIA_HOSTING_PROVIDERS.map((provider) => provider.id));

/** Raw attempt shape from Android plugin rejection payload */
interface RawAttempt {
  provider?: unknown;
  success?: unknown;
  error?: unknown;
  stage?: unknown;
  elapsedMs?: unknown;
  matchedSelectors?: unknown;
}

/**
 * Normalizes Android Capacitor rejection payload. The plugin may reject with
 * `{ message, code, data: { attempts: [...] } }` where attempts contain
 * provider, error, stage, elapsedMs, matchedSelectors. We extract and attach
 * attempts to the error so formatAggregatedError can surface them.
 */
function normalizeAndroidRejection(error: unknown): Error & { attempts?: ProviderAttempt[] } {
  const err = error as Error & { data?: { attempts?: unknown[] } };
  const raw = err?.data?.attempts;
  if (!Array.isArray(raw) || raw.length === 0) return err;

  const attempts: ProviderAttempt[] = raw
    .map((a: unknown): ProviderAttempt | null => {
      const item = a as RawAttempt;
      const provider = item?.provider;
      if (typeof provider !== 'string' || !VALID_PROVIDERS.has(provider)) return null;
      const ms = typeof item?.elapsedMs === 'number' ? item.elapsedMs : undefined;
      let sel: string[] | undefined;
      if (Array.isArray(item?.matchedSelectors)) {
        sel = (item.matchedSelectors as unknown[]).filter((s): s is string => typeof s === 'string');
      } else if (typeof item?.matchedSelectors === 'string' && item.matchedSelectors.trim()) {
        sel = item.matchedSelectors
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
      const attempt: ProviderAttempt = {
        provider: provider as ProviderId,
        success: Boolean(item?.success),
        error: typeof item?.error === 'string' ? item.error : undefined,
        stage: typeof item?.stage === 'string' && item.stage ? (ANDROID_STAGE_MAP[item.stage] ?? 'unknown') : undefined,
        elapsedMs: ms,
        matchedSelectors: sel?.length ? sel : undefined,
      };
      return attempt;
    })
    .filter((a): a is ProviderAttempt => a !== null);

  if (attempts.length > 0) {
    (err as Error & { attempts?: ProviderAttempt[] }).attempts = attempts;
  }
  return err as Error & { attempts?: ProviderAttempt[] };
}

interface UseFileUploadOptions {
  onUploadComplete: (url: string, fileName: string) => void;
}

export interface UploadedFileResult {
  url: string;
  fileName: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const marker = result.indexOf(',');
      resolve(marker >= 0 ? result.slice(marker + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

const UPLOAD_FILE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,.swf,application/x-shockwave-flash,application/vnd.adobe.flash.movie';

export function useFileUpload(options: UseFileUploadOptions) {
  const { t } = useTranslation();
  const { onUploadComplete } = options;
  const uploadMode = useMediaHostingStore((s) => s.uploadMode);
  const preferredProvider = useMediaHostingStore((s) => s.preferredProvider);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const getAvailableProviderOrder = useCallback(async () => {
    const runtime = getMediaHostingRuntime();
    const supportedOrder = getProviderOrder({ mode: uploadMode, preferredProvider, runtime });
    const availability = await ensureProviderAvailability(runtime);
    const order = getProviderOrder({ mode: uploadMode, preferredProvider, runtime, availability });

    if (order.length === 0) {
      if (supportedOrder.length > 0) {
        const message =
          uploadMode === 'preferred' && availability[preferredProvider] === 'unavailable'
            ? `${preferredProvider} is unavailable from this network`
            : 'No reachable upload providers are available from this network';
        throw new Error(message);
      }
      throw new Error(`${preferredProvider} is not supported on ${runtime}`);
    }

    return { runtime, order };
  }, [uploadMode, preferredProvider]);

  const handleUploadError = useCallback(
    (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === FILE_SELECTION_CANCELLED_ERROR) return;

      const err = normalizeAndroidRejection(error) as Error & { attempts?: ProviderAttempt[] };
      if (err.attempts && err.attempts.length > 0) {
        window.alert(formatAggregatedError(err.attempts, t));
      } else if (uploadMode === 'preferred') {
        window.alert(formatPreferredModeError(errorMessage, t));
      } else {
        window.alert(`${t('upload_failed')}: ${errorMessage}`);
      }
    },
    [t, uploadMode],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedFileResult | null> => {
      if (uploadMode === 'none') return null;

      try {
        setIsUploading(true);
        setUploadedFileName(null);
        const { runtime, order } = await getAvailableProviderOrder();
        let result: UploadedFileResult | null = null;

        if (runtime === 'android') {
          const cleanFile = await stripMediaMetadata(file);
          const pluginResult = await FileUploader.uploadGeneratedMedia({
            providerOrder: order,
            fileName: cleanFile.name,
            mimeType: cleanFile.type || 'application/octet-stream',
            base64: await readFileAsBase64(cleanFile),
          });
          result = pluginResult.url ? { url: pluginResult.url, fileName: pluginResult.fileName || file.name } : null;
        } else {
          const url = await orchestrateUpload(file, order);
          result = { url, fileName: file.name };
        }

        if (result?.url) {
          setUploadedFileName(result.fileName);
          onUploadComplete(result.url, result.fileName);
        }
        return result;
      } catch (error) {
        handleUploadError(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [getAvailableProviderOrder, handleUploadError, onUploadComplete, uploadMode],
  );

  const handleUpload = useCallback(async () => {
    if (uploadMode === 'none') return;

    try {
      setIsUploading(true);
      setUploadedFileName(null);
      const runtime = getMediaHostingRuntime();
      const orderPromise = getAvailableProviderOrder();
      if (runtime === 'android') {
        const { order } = await orderPromise;
        // The native picker uploads straight from the device; the plugin strips
        // metadata before upload (android MediaMetadataStripper).
        const result = await FileUploader.pickAndUploadMedia({ providerOrder: order });
        if (result.url) {
          if (result.fileName) setUploadedFileName(result.fileName);
          onUploadComplete(result.url, result.fileName);
        }
        return;
      }

      if (runtime === 'web') {
        // Browsers only open a file picker during the click's short-lived user
        // activation, which the availability probes can outlast, so web opens the
        // picker first and awaits the provider order after a file is chosen.
        orderPromise.catch(() => undefined);
      } else {
        await orderPromise;
      }
      // Electron keeps the focus fallback; browsers emit `cancel`, and Safari can deliver
      // `change` after the fallback window, which would drop the selection.
      const file = await selectFileViaInput(UPLOAD_FILE_ACCEPT, { resolveOnWindowFocus: runtime === 'electron' });
      if (!file) {
        throw new Error(FILE_SELECTION_CANCELLED_ERROR);
      }

      const { order } = await orderPromise;
      const url = await orchestrateUpload(file, order);
      setUploadedFileName(file.name);
      onUploadComplete(url, file.name);
    } catch (error) {
      handleUploadError(error);
    } finally {
      setIsUploading(false);
    }
  }, [getAvailableProviderOrder, handleUploadError, onUploadComplete, uploadMode]);

  return {
    isUploading,
    uploadedFileName,
    handleUpload,
    uploadFile,
  };
}
