import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useMediaHostingStore, { MEDIA_HOSTING_PROVIDERS } from '../../../stores/use-media-hosting-store';
import type { ProviderId } from '../../../lib/media-hosting/types';
import { isWebRuntime } from '../../../lib/media-hosting/show-upload-controls';
import styles from '../interface-settings/interface-settings.module.css';

const RADIO_NAME = 'media-hosting-provider';
const RELEASES_URL = 'https://github.com/bitsocialhq/5chan/releases/latest';

const MediaHostingSettings = () => {
  const { t } = useTranslation();
  const uploadMode = useMediaHostingStore((state) => state.uploadMode);
  const preferredProvider = useMediaHostingStore((state) => state.preferredProvider);
  const setUploadMode = useMediaHostingStore((state) => state.setUploadMode);
  const setPreferredProvider = useMediaHostingStore((state) => state.setPreferredProvider);
  const isWeb = isWebRuntime();

  return (
    <div className={styles.interfaceSettings}>
      <div role='radiogroup' aria-label={t('media_hosting')}>
        {isWeb && (
          <div className={styles.webUploadWarning}>
            {t('upload_not_supported_web_before_link')}{' '}
            <a href={RELEASES_URL} target='_blank' rel='noopener noreferrer'>
              {t('upload_not_supported_web_link_text')}
            </a>
          </div>
        )}
        <div className={styles.setting}>
          <label>
            <input type='radio' name={RADIO_NAME} value='random' checked={uploadMode === 'random'} onChange={() => setUploadMode('random')} disabled={isWeb} />
            {t('media_hosting_random')}
          </label>
        </div>
        <div className={styles.setting}>
          <label>
            <input type='radio' name={RADIO_NAME} value='preferred' checked={uploadMode === 'preferred'} onChange={() => setUploadMode('preferred')} disabled={isWeb} />
            {t('media_hosting_preferred')}
          </label>
          {uploadMode === 'preferred' && (
            <div role='radiogroup' aria-label={t('media_hosting_preferred_provider_label')}>
              {MEDIA_HOSTING_PROVIDERS.map((provider) => (
                <div key={provider.id} className={styles.setting}>
                  <label>
                    <input
                      type='radio'
                      name={`${RADIO_NAME}-provider`}
                      value={provider.id}
                      checked={preferredProvider === provider.id}
                      onChange={() => setPreferredProvider(provider.id as ProviderId)}
                      disabled={isWeb}
                    />
                    {provider.label} (
                    <a href={provider.homepageUrl} target='_blank' rel='noopener noreferrer'>
                      {provider.homepageUrl}
                    </a>
                    )
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.setting}>
          <label>
            <input type='radio' name={RADIO_NAME} value='none' checked={uploadMode === 'none'} onChange={() => setUploadMode('none')} disabled={isWeb} />
            {t('media_hosting_none')}
          </label>
          <div className={styles.settingTip}>{t('media_hosting_none_tip')}</div>
        </div>
      </div>
    </div>
  );
};

export default memo(MediaHostingSettings);
