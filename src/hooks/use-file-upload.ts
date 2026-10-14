import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FileUploader from '../plugins/file-uploader';
import { formatAggregatedError, formatPreferredModeError, type ProviderAttempt } from '../lib/media-hosting/error-format';
import { getProviderOrder } from '../lib/media-hosting/provider-order';
import { getMediaHostingRuntime } from '../lib/media-hosting/show-upload-controls';
import { MEDIA_HOSTING_PROVIDERS } from '../lib/media-hosting/providers';
import { getFileAttachment } from '../lib/media-hosting/attached-media';
import { orchestrateUpload } from '../lib/media-hosting/upload-orchestrator';
import { stripMediaMetadata } from '../lib/media-metadata/strip-media-metadata';
import { ensureProviderAvailability } from '../lib/media-hosting/provider-availability';
import { selectFileViaInput } from '../lib/utils/file-picker-utils';
import useMediaHostingStore from '../stores/use-media-hosting-store';
import type { AttachedMedia, ProviderId, UploadAttemptStage } from '../lib/media-hosting/types';

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

export function useFileUpload() {
  const { t } = useTranslation();
  const uploadMode = useMediaHostingStore((s) => s.uploadMode);
  const preferredProvider = useMediaHostingStore((s) => s.preferredProvider);
  const setShowLinkField = useMediaHostingStore((s) => s.setShowLinkField);
  const [isUploading, setIsUploading] = useState(false);

  const getAvailableProviderOrder = useCallback(async () => {
    const runtime = getMediaHostingRuntime();
    if (uploadMode === 'none') {
      throw new Error('Uploads are turned off in the media hosting settings');
    }
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

      // A failed upload leaves pasting a link as the only way to attach the file, so reveal the field.
      setShowLinkField(true);
      const err = normalizeAndroidRejection(error) as Error & { attempts?: ProviderAttempt[] };
      if (err.attempts && err.attempts.length > 0) {
        window.alert(formatAggregatedError(err.attempts, t));
      } else if (uploadMode === 'preferred') {
        window.alert(formatPreferredModeError(errorMessage, t));
      } else {
        window.alert(`${t('upload_failed')}: ${errorMessage}`);
      }
    },
    [setShowLinkField, t, uploadMode],
  );

  /** Opens the file picker and returns the chosen media without uploading it, or null when cancelled. */
  const chooseFile = useCallback(async (): Promise<AttachedMedia | null> => {
    if (uploadMode === 'none') return null;

    const runtime = getMediaHostingRuntime();
    try {
      if (runtime === 'android') {
        // The native picker keeps the file native-side, so videos never cross the bridge as base64.
        const picked = await FileUploader.pickMedia();
        return { kind: 'picked', id: picked.id, name: picked.fileName, mimeType: picked.mimeType };
      }
      // Electron keeps the focus fallback; browsers emit `cancel`, and Safari can deliver
      // `change` after the fallback window, which would drop the selection.
      const file = await selectFileViaInput(UPLOAD_FILE_ACCEPT, { resolveOnWindowFocus: runtime === 'electron' });
      return file ? getFileAttachment(file) : null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== FILE_SELECTION_CANCELLED_ERROR) {
        window.alert(`${t('error')}: ${errorMessage}`);
      }
      return null;
    }
  }, [t, uploadMode]);

  /** Uploads attached media through the enabled providers; alerts and returns null when the upload fails. */
  const uploadAttachment = useCallback(
    async (media: AttachedMedia): Promise<UploadedFileResult | null> => {
      try {
        setIsUploading(true);
        const { runtime, order } = await getAvailableProviderOrder();
        let result: UploadedFileResult;
        let awaitingReview = false;

        if (media.kind === 'picked') {
          // The plugin strips metadata before upload (android MediaMetadataStripper).
          const pluginResult = await FileUploader.uploadPickedMedia({ id: media.id, providerOrder: order });
          result = { url: pluginResult.url, fileName: pluginResult.fileName || media.name };
        } else if (runtime === 'android') {
          const cleanFile = await stripMediaMetadata(media.file);
          const pluginResult = await FileUploader.uploadGeneratedMedia({
            providerOrder: order,
            fileName: cleanFile.name,
            mimeType: cleanFile.type || 'application/octet-stream',
            base64: await readFileAsBase64(cleanFile),
          });
          result = { url: pluginResult.url, fileName: pluginResult.fileName || media.name };
        } else {
          const uploaded = await orchestrateUpload(media.file, order);
          result = { url: uploaded.url, fileName: media.name };
          awaitingReview = uploaded.awaitingReview === true;
        }

        if (!result.url) {
          throw new Error('The upload returned no link');
        }
        // The link is used either way: it starts working once the host approves it.
        if (awaitingReview) window.alert(t('upload_awaiting_review'));
        return result;
      } catch (error) {
        handleUploadError(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [getAvailableProviderOrder, handleUploadError, t],
  );

  return {
    isUploading,
    chooseFile,
    uploadAttachment,
  };
}
