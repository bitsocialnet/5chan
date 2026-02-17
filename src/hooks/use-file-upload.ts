import { useCallback, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';
import FileUploader from '../plugins/file-uploader';
import { uploadToCatbox } from '../lib/utils/catbox-utils';
import useMediaHostingStore from '../stores/use-media-hosting-store';

const FILE_SELECTION_CANCELLED_ERROR = 'File selection cancelled';

async function uploadByProvider(provider: string, file: File): Promise<string> {
  if (provider === 'catbox') return uploadToCatbox(file);
  throw new Error(`Unsupported media provider: ${provider}`);
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
  const selectedProvider = useMediaHostingStore((s) => s.selectedProvider);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const handleUpload = useCallback(async () => {
    if (selectedProvider === 'none') return;
    if (selectedProvider !== 'catbox') return;

    try {
      setIsUploading(true);
      setUploadedFileName(null);

      if (Capacitor.getPlatform() === 'android') {
        const result = await FileUploader.pickAndUploadMedia();
        if (result.url) {
          if (result.fileName) {
            setUploadedFileName(result.fileName);
          }
          onUploadComplete(result.url, result.fileName);
        }
        return;
      }

      if (window.electronApi?.isElectron) {
        const file = await selectFileViaInput();
        if (!file) {
          throw new Error(FILE_SELECTION_CANCELLED_ERROR);
        }

        const url = await uploadByProvider(selectedProvider, file);
        setUploadedFileName(file.name);
        onUploadComplete(url, file.name);
        return;
      }

      window.alert(t('upload_not_supported_web'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== FILE_SELECTION_CANCELLED_ERROR) {
        window.alert(`${t('upload_failed')}: ${errorMessage}`);
      }
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete, t, selectedProvider]);

  return {
    isUploading,
    uploadedFileName,
    handleUpload,
  };
}
