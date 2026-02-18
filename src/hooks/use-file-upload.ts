import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import FileUploader from '../plugins/file-uploader';
import { formatAggregatedError, formatPreferredModeError, type ProviderAttempt } from '../lib/media-hosting/error-format';
import { getProviderOrder } from '../lib/media-hosting/provider-order';
import { orchestrateElectronUpload } from '../lib/media-hosting/upload-orchestrator';
import useMediaHostingStore from '../stores/use-media-hosting-store';

const FILE_SELECTION_CANCELLED_ERROR = 'File selection cancelled';

function getRuntime(): 'web' | 'electron' | 'android' {
  if (Capacitor.getPlatform() === 'android') return 'android';
  if (window.electronApi?.isElectron) return 'electron';
  return 'web';
}

export interface UseFileUploadOptions {
  onUploadComplete: (url: string, fileName: string) => void;
}

function selectFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,video/mp4,video/webm';
    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
      window.removeEventListener('focus', onFocus);
    };

    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (input.files && input.files.length > 0) {
          return;
        }
        cleanup();
        resolve(null);
      }, 100);
    };

    input.addEventListener('change', () => {
      window.removeEventListener('focus', onFocus);
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        cleanup();
        resolve(file);
      } else {
        cleanup();
        resolve(null);
      }
    });

    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

export function useFileUpload(options: UseFileUploadOptions) {
  const { t } = useTranslation();
  const { onUploadComplete } = options;
  const uploadMode = useMediaHostingStore((s) => s.uploadMode);
  const preferredProvider = useMediaHostingStore((s) => s.preferredProvider);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const handleUpload = useCallback(async () => {
    if (uploadMode === 'none') return;

    const runtime = getRuntime();
    const order = getProviderOrder({ mode: uploadMode, preferredProvider, runtime });

    try {
      setIsUploading(true);
      setUploadedFileName(null);

      if (Capacitor.getPlatform() === 'android') {
        const result = await FileUploader.pickAndUploadMedia({ providerOrder: order });
        if (result.url) {
          if (result.fileName) setUploadedFileName(result.fileName);
          onUploadComplete(result.url, result.fileName);
        }
        return;
      }

      if (window.electronApi?.isElectron) {
        const file = await selectFileViaInput();
        if (!file) {
          throw new Error(FILE_SELECTION_CANCELLED_ERROR);
        }

        const url = await orchestrateElectronUpload(file, order);
        setUploadedFileName(file.name);
        onUploadComplete(url, file.name);
        return;
      }

      window.alert(t('upload_not_supported_web'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === FILE_SELECTION_CANCELLED_ERROR) return;

      const err = error as Error & { attempts?: ProviderAttempt[] };
      if (err.attempts && err.attempts.length > 0) {
        window.alert(formatAggregatedError(err.attempts, t));
      } else if (uploadMode === 'preferred') {
        window.alert(formatPreferredModeError(errorMessage, t));
      } else {
        window.alert(`${t('upload_failed')}: ${errorMessage}`);
      }
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete, t, uploadMode, preferredProvider]);

  return {
    isUploading,
    uploadedFileName,
    handleUpload,
  };
}
