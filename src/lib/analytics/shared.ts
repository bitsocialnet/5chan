export const isAnalyticsEnabled = (): boolean =>
  import.meta.env.PROD &&
  import.meta.env.VITE_APP_DISTRIBUTION !== 'fdroid' &&
  typeof window !== 'undefined' &&
  !window.isElectron &&
  window.location.protocol === 'https:' &&
  (window.location.hostname === '5chan.app' || window.location.hostname === 'www.5chan.app');

// Failure outcomes only: see startPostingAnalytics for why submits and successes are never sent.
export type PostingAnalyticsEvent =
  | 'post_validation_failed'
  | 'post_precheck_failed'
  | 'post_upload_failed'
  | 'post_challenge_failed'
  | 'post_publish_failed'
  | 'post_cancelled';
