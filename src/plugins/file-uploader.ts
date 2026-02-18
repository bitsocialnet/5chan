import { registerPlugin } from '@capacitor/core';
import type { ProviderAttempt, ProviderId } from '../lib/media-hosting/types';

export interface PickAndUploadMediaOptions {
  providerOrder: ProviderId[];
}

export interface PickAndUploadMediaResult {
  url: string;
  fileName: string;
  provider: ProviderId;
  attempts?: ProviderAttempt[];
}

export interface FileUploaderPlugin {
  pickAndUploadMedia(options?: PickAndUploadMediaOptions): Promise<PickAndUploadMediaResult>;
}

const FileUploader = registerPlugin<FileUploaderPlugin>('FileUploader');

export default FileUploader;
