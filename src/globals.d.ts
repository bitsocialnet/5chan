declare global {
  interface Window {
    isElectron: boolean;
  }
}

import type { ProviderId } from './lib/media-hosting/types';

declare global {
  interface Window {
    electronApi?: {
      isElectron: boolean;
      copyToClipboard: (text: string) => Promise<{ success: boolean; error?: string }>;
      getPlatform: () => Promise<{ platform: NodeJS.Platform; arch: string; version: string }>;
      automateUploadMedia: (options: { provider: ProviderId; filePath: string }) => Promise<{ url: string; provider: ProviderId }>;
    };
  }
}

export {};
