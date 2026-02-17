import { useTranslation } from 'react-i18next';
import useMediaHostingStore, { MEDIA_HOSTING_PROVIDERS } from '../../../stores/use-media-hosting-store';
import styles from '../interface-settings/interface-settings.module.css';

const RADIO_NAME = 'media-hosting-provider';

const MediaHostingSettings = () => {
  const { t } = useTranslation();
  const selectedProvider = useMediaHostingStore((state) => state.selectedProvider);
  const setSelectedProvider = useMediaHostingStore((state) => state.setSelectedProvider);

  return (
    <div className={styles.interfaceSettings}>
      <div role='radiogroup' aria-label={t('media_hosting')}>
        {MEDIA_HOSTING_PROVIDERS.map((provider) => (
          <div key={provider.id} className={styles.setting}>
            <label>
              <input type='radio' name={RADIO_NAME} value={provider.id} checked={selectedProvider === provider.id} onChange={() => setSelectedProvider(provider.id)} />
              {provider.name} (
              <a href={provider.url} target='_blank' rel='noopener noreferrer'>
                {provider.url}
              </a>
              )
            </label>
          </div>
        ))}
        <div className={styles.setting}>
          <label>
            <input type='radio' name={RADIO_NAME} value='none' checked={selectedProvider === 'none'} onChange={() => setSelectedProvider('none')} />
            {t('media_hosting_none')}
          </label>
          <div className={styles.settingTip}>{t('media_hosting_none_tip')}</div>
        </div>
      </div>
    </div>
  );
};

export default MediaHostingSettings;
