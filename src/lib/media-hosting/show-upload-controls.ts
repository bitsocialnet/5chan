import { Capacitor } from '@capacitor/core';
import type { MediaHostingRuntime, UploadMode } from './types';

export function isElectronRuntime(): boolean {
  return window.electronApi?.isElectron === true || window.isElectron === true;
}

export function getMediaHostingRuntime(): MediaHostingRuntime {
  if (Capacitor.getPlatform() === 'android') return 'android';
  if (isElectronRuntime()) return 'electron';
  return 'web';
}

/** Web runtime = web browser, not Electron */
export function isWebRuntime(): boolean {
  return getMediaHostingRuntime() === 'web';
}

/** Whether to show the upload CTA in post/reply forms: hidden only when uploadMode is 'none'. */
export function getShowUploadControls(uploadMode: UploadMode): boolean {
  return uploadMode !== 'none';
}
