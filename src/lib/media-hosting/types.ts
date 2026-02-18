/** Supported media hosting provider identifiers */
export type ProviderId = 'catbox' | 'imgur' | 'postimages';

/** User-facing upload mode */
export type UploadMode = 'random' | 'preferred' | 'none';

/** Runtime environment for automation support */
export type MediaHostingRuntime = 'web' | 'electron' | 'android';

/** Result of a single provider upload attempt */
export interface ProviderAttempt {
  provider: ProviderId;
  success: boolean;
  url?: string;
  error?: string;
}

/** Successful upload result */
export interface ProviderSuccess {
  provider: ProviderId;
  url: string;
  fileName: string;
  attempts?: ProviderAttempt[];
}

/** Aggregate error when all providers fail */
export interface ProviderAggregateError {
  attempts: ProviderAttempt[];
  message: string;
}
