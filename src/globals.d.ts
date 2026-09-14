import type { ElementInfo } from 'element-source';

// what element-source resolves a DOM node to: the library's ElementInfo plus a flag saying whether
// anything was actually resolved, or a message explaining why nothing was
type ElementSourceResult = (ElementInfo & { available: boolean }) | { error: string };

interface ElementSourceApi {
  ready: boolean;
  error: string | null;
  resolve: (node: unknown) => Promise<ElementSourceResult>;
  resolveBySelector: (selector: string) => Promise<ElementSourceResult>;
  resolveAtPoint: (x: number, y: number) => Promise<ElementSourceResult>;
  formatStack: (stack: unknown, maxLines?: number) => string;
}

declare global {
  interface Window {
    // Dev-only tooling; profiling sessions set this flag before navigation.
    __PROFILING__?: boolean;
    __ELEMENT_SOURCE__?: ElementSourceApi;
    BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING?: boolean;
    isElectron: boolean;
    defaultPkcOptions?: Record<string, unknown>;
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
      automateUploadGeneratedMedia?: (options: {
        provider: ProviderId;
        fileName: string;
        mimeType: string;
        bytes: number[];
      }) => Promise<{ url: string; provider: ProviderId }>;
      downloadAndInstallUpdate?: (options: { url: string; fileName: string }) => Promise<void>;
      getPathForFile?: (file: File) => string | null;
    };
  }
}

export {};
