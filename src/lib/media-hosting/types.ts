/** Supported media hosting provider identifiers */
export type ProviderId = 'forge' | 'catbox' | 'imgur' | 'imgbb';

/** User-facing upload mode */
export type UploadMode = 'random' | 'preferred' | 'none';

/** Runtime environment for automation support */
export type MediaHostingRuntime = 'web' | 'electron' | 'android';

/** Stage at which an upload attempt failed (enables comparable errors across Electron/Android) */
export type UploadAttemptStage =
  | 'blocked' /** captcha/login/challenge detected */
  | 'provider_error' /** provider returned an upload-specific error */
  | 'file_input' /** file input not found */
  | 'submit' /** submit button not found */
  | 'timeout' /** upload or extraction timeout */
  | 'page_load' /** page load failed */
  | 'unknown';

/** What a running upload is doing: sending the file, or waiting while the host runs its automated checks on it. */
export type UploadPhase = 'uploading' | 'checking';

/** A successful upload. */
export interface UploadedMedia {
  url: string;
  /** The host holds the file for review, so the URL does not serve yet (e.g. a new SWF on Forge Images). */
  awaitingReview?: boolean;
}

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

/** Media chosen in a post or reply form. It is only uploaded once the post is submitted. */
export type AttachedMedia =
  /** A browser or Electron file, or a generated drawing. */
  | { kind: 'file'; file: File; name: string; mimeType: string }
  /** A file picked by the Android plugin, which keeps it native-side and streams it from its content URI at upload. */
  | { kind: 'picked'; id: string; name: string; mimeType: string };
