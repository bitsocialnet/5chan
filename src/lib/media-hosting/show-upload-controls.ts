import { Capacitor } from '@capacitor/core';
import type { UploadMode } from './types';

/** Web runtime = web browser, not Electron */
export function isWebRuntime(): boolean {
  return Capacitor.getPlatform() === 'web' && !window.electronApi?.isElectron;
}

/**
 * Whether to show the upload CTA in post/reply forms.
 * On web runtime, always true (for app promotion); otherwise true when uploadMode !== 'none'.
 */
export function getShowUploadControls(uploadMode: UploadMode, isWeb: boolean): boolean {
  if (isWeb) return true;
  return uploadMode !== 'none';
}
