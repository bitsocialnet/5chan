import { registerPlugin } from '@capacitor/core';
import type { ProviderAttempt, ProviderId } from '../lib/media-hosting/types';

interface PickAndUploadMediaOptions {
  providerOrder: ProviderId[];
}

interface PickAndUploadMediaResult {
  url: string;
  fileName: string;
  provider: ProviderId;
  attempts?: ProviderAttempt[];
}

interface FileUploaderPlugin {
  pickAndUploadMedia(options?: PickAndUploadMediaOptions): Promise<PickAndUploadMediaResult>;
}

const FileUploader = registerPlugin<FileUploaderPlugin>('FileUploader');

export default FileUploader;
