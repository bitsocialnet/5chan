import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useMediaHostingStore, { MEDIA_HOSTING_PROVIDERS } from '../../../stores/use-media-hosting-store';
import type { ProviderId } from '../../../lib/media-hosting/types';
import { getMediaHostingRuntime } from '../../../lib/media-hosting/show-upload-controls';
import { useProviderAvailability } from '../../../hooks/use-provider-availability';
import styles from '../interface-settings/interface-settings.module.css';

const RADIO_NAME = 'media-hosting-provider';

const MediaHostingSettings = () => {
  const { t } = useTranslation();
  const uploadMode = useMediaHostingStore((state) => state.uploadMode);
  const preferredProvider = useMediaHostingStore((state) => state.preferredProvider);
  const setUploadMode = useMediaHostingStore((state) => state.setUploadMode);
  const setPreferredProvider = useMediaHostingStore((state) => state.setPreferredProvider);
  const runtime = getMediaHostingRuntime();
  const availability = useProviderAvailability(runtime);

  return (
    <div className={styles.interfaceSettings}>
      <div role='radiogroup' aria-label={t('media_hosting')}>
        <div className={styles.setting}>
          <label>
            <input
              type='radio'
              aria-label={t('media_hosting_random')}
              name={RADIO_NAME}
              value='random'
              checked={uploadMode === 'random'}
              onChange={() => setUploadMode('random')}
            />
            {t('media_hosting_random')}
          </label>
        </div>
        <div className={styles.setting}>
          <label>
            <input
              type='radio'
              aria-label={t('media_hosting_preferred')}
              name={RADIO_NAME}
              value='preferred'
              checked={uploadMode === 'preferred'}
              onChange={() => setUploadMode('preferred')}
            />
            {t('media_hosting_preferred')}
          </label>
          {uploadMode === 'preferred' && (
            <div role='radiogroup' aria-label={t('media_hosting_preferred_provider_label')}>
              {MEDIA_HOSTING_PROVIDERS.map((provider) => {
                const providerUnavailable = availability[provider.id] === 'unavailable';
                const providerDisabled = !provider.supportedRuntimes.includes(runtime) || providerUnavailable;
                return (
                  <div key={provider.id} className={styles.setting}>
                    <label title={providerUnavailable ? t('media_hosting_provider_unavailable') : undefined}>
                      <input
                        type='radio'
                        aria-label={provider.label}
                        name={`${RADIO_NAME}-provider`}
                        value={provider.id}
                        checked={preferredProvider === provider.id}
                        onChange={() => setPreferredProvider(provider.id as ProviderId)}
                        disabled={providerDisabled}
                      />
                      {provider.label} (
                      <a href={provider.homepageUrl} target='_blank' rel='noopener noreferrer'>
                        {provider.homepageUrl}
                      </a>
                      )
                    </label>
                    {providerUnavailable && <div className={styles.settingTip}>{t('media_hosting_provider_unavailable')}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className={styles.setting}>
          <label>
            <input
              type='radio'
              aria-label={t('media_hosting_none')}
              name={RADIO_NAME}
              value='none'
              checked={uploadMode === 'none'}
              onChange={() => setUploadMode('none')}
            />
            {t('media_hosting_none')}
          </label>
          <div className={styles.settingTip}>{t('media_hosting_none_tip')}</div>
        </div>
      </div>
    </div>
  );
};

export default memo(MediaHostingSettings);
