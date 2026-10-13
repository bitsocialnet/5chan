import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useMediaHostingStore from '../../../stores/use-media-hosting-store';
import { resolveUploadSettings } from '../../../lib/media-hosting/provider-order';
import { getRuntimeProviders } from '../../../lib/media-hosting/providers';
import { getMediaHostingRuntime } from '../../../lib/media-hosting/show-upload-controls';
import { useProviderAvailability } from '../../../hooks/use-provider-availability';
import styles from '../interface-settings/interface-settings.module.css';

const RADIO_NAME = 'media-hosting-provider';

const MediaHostingSettings = () => {
  const { t } = useTranslation();
  const storedUploadMode = useMediaHostingStore((state) => state.uploadMode);
  const storedPreferredProvider = useMediaHostingStore((state) => state.preferredProvider);
  const setUploadMode = useMediaHostingStore((state) => state.setUploadMode);
  const setPreferredProvider = useMediaHostingStore((state) => state.setPreferredProvider);
  const runtime = getMediaHostingRuntime();
  // Only list providers this runtime can upload to (web: just the CORS-enabled ones).
  const providers = getRuntimeProviders(runtime);
  const { mode: uploadMode, preferredProvider } = resolveUploadSettings({ mode: storedUploadMode, preferredProvider: storedPreferredProvider, runtime });
  const availability = useProviderAvailability(runtime);

  return (
    <div className={styles.interfaceSettings}>
      <div role='radiogroup' aria-label={t('media_hosting')}>
        {providers.length > 1 && (
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
        )}
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
              {providers.map((provider) => {
                const providerUnavailable = availability[provider.id] === 'unavailable';
                return (
                  <div key={provider.id} className={styles.setting}>
                    <label title={providerUnavailable ? t('media_hosting_provider_unavailable') : undefined}>
                      <input
                        type='radio'
                        aria-label={provider.label}
                        name={`${RADIO_NAME}-provider`}
                        value={provider.id}
                        checked={preferredProvider === provider.id}
                        onChange={() => setPreferredProvider(provider.id)}
                        disabled={providerUnavailable}
                      />
                      {provider.label} (
                      <a href={provider.homepageUrl} target='_blank' rel='noopener noreferrer'>
                        {new URL(provider.homepageUrl).host}
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
