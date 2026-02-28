/** Supported media hosting provider identifiers */
export type ProviderId = 'catbox' | 'imgur';

/** User-facing upload mode */
export type UploadMode = 'random' | 'preferred' | 'none';

/** Runtime environment for automation support */
export type MediaHostingRuntime = 'web' | 'electron' | 'android';

/** Stage at which an upload attempt failed (enables comparable errors across Electron/Android) */
export type UploadAttemptStage =
  | 'blocked' /** captcha/login/challenge detected */
  | 'file_input' /** file input not found */
  | 'submit' /** submit button not found */
  | 'timeout' /** upload or extraction timeout */
  | 'page_load' /** page load failed */
  | 'unknown';

/** Result of a single provider upload attempt */
export interface ProviderAttempt {
  provider: ProviderId;
  success: boolean;
  url?: string;
  error?: string;
  /** Stage at which the attempt failed; inferred or reported by plugin */
  stage?: UploadAttemptStage;
  /** Elapsed time in ms for the attempt */
  elapsedMs?: number;
  /** Selectors tried (e.g. when file input / submit not found); from plugin or parsed from error */
  matchedSelectors?: string[];
}
