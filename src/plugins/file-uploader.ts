import { registerPlugin } from '@capacitor/core';
import type { ProviderAttempt, ProviderId } from '../lib/media-hosting/types';

interface PickedMedia {
  /** Opaque handle for the picked file; the plugin keeps its content URI so the web layer never names native files. */
  id: string;
  fileName: string;
  mimeType: string;
}

interface UploadPickedMediaOptions {
  id: string;
  providerOrder: ProviderId[];
}

interface UploadGeneratedMediaOptions {
  providerOrder: ProviderId[];
  fileName: string;
  mimeType: string;
  base64: string;
}

interface UploadMediaResult {
  url: string;
  fileName: string;
  provider: ProviderId;
  attempts?: ProviderAttempt[];
}

interface FileUploaderPlugin {
  pickMedia(): Promise<PickedMedia>;
  uploadPickedMedia(options: UploadPickedMediaOptions): Promise<UploadMediaResult>;
  uploadGeneratedMedia(options: UploadGeneratedMediaOptions): Promise<UploadMediaResult>;
}

const FileUploader = registerPlugin<FileUploaderPlugin>('FileUploader');

export default FileUploader;
