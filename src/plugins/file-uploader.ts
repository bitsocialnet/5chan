import { registerPlugin } from '@capacitor/core';
import type { ProviderAttempt, ProviderId } from '../lib/media-hosting/types';

interface PickedMedia {
  /** Opaque handle the plugin uploads the picked file by, so the web layer cannot make it upload an arbitrary native file. */
  id: string;
  fileName: string;
  mimeType: string;
  /** WebView-local URL that streams the picked file, for uploads made from the web layer (Forge Images). */
  webPath: string;
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
