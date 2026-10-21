import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useStatsProvidersStore from '../../../stores/use-stats-providers-store';
import { STATS_PROVIDERS } from '../../../lib/stats-providers';
import styles from '../interface-settings/interface-settings.module.css';

const StatsProvidersSettings = () => {
  const { t } = useTranslation();
  const usePureP2PStats = useStatsProvidersStore((state) => state.usePureP2PStats);
  const setUsePureP2PStats = useStatsProvidersStore((state) => state.setUsePureP2PStats);

  return (
    <div className={styles.interfaceSettings}>
      <div className={styles.setting}>
        {STATS_PROVIDERS.map((provider) => (
          <div key={provider.id}>
            <a href={provider.siteUrl} target='_blank' rel='noopener noreferrer'>
              {provider.name}
            </a>
          </div>
        ))}
        <div className={styles.settingTip}>{t('stats_providers_tip')}</div>
      </div>
      <div className={styles.setting}>
        <label>
          <input type='checkbox' checked={usePureP2PStats} onChange={(event) => setUsePureP2PStats(event.target.checked)} />
          {t('use_pure_p2p_stats')}
        </label>
        <div className={styles.settingTip}>{t('pure_p2p_stats_tip')}</div>
      </div>
    </div>
  );
};

export default memo(StatsProvidersSettings);
