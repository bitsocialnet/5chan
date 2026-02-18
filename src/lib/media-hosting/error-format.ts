import type { ProviderId } from './types';

export interface ProviderAttempt {
  provider: ProviderId;
  success: boolean;
  error?: string;
}

export type TranslateFn = (key: string) => string;

/**
 * Formats aggregated error message when all providers fail (random mode).
 */
export function formatAggregatedError(attempts: ProviderAttempt[], t: TranslateFn): string {
  const details = attempts.map((a) => `${a.provider}: ${a.error ?? 'unknown'}`).join('; ');
  return `${t('upload_failed')}. ${t('upload_failed_all_providers')}: ${details}`;
}

/**
 * Formats error for preferred mode with actionable guidance.
 */
export function formatPreferredModeError(errorMessage: string, t: TranslateFn): string {
  return `${t('upload_failed')}: ${errorMessage}. ${t('upload_failed_preferred_guidance')}`;
}
