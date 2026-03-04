import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import packageJson from '../../../../package.json';
import styles from './interface-settings.module.css';
import capitalize from 'lodash/capitalize';
import useExpandedMediaStore from '../../../stores/use-expanded-media-store';
import useFeedViewSettingsStore from '../../../stores/use-feed-view-settings-store';
import Version from '../../version';

const commitRef = process.env.VITE_COMMIT_REF;
const isElectron = window.electronApi?.isElectron === true;

const fetchLatestVersionInfo = async (t: (key: string, opts?: Record<string, unknown>) => string): Promise<void> => {
  try {
    const packageRes = await fetch('https://raw.githubusercontent.com/bitsocialhq/5chan/master/package.json', { cache: 'no-cache' });
    const packageData = await packageRes.json();
    let updateAvailable = false;

    if (packageJson.version !== packageData.version) {
      const newVersionText = t('new_stable_version', { newVersion: packageData.version, oldVersion: packageJson.version });
      const updateActionText = isElectron
        ? t('download_latest_desktop', { link: 'https://github.com/bitsocialhq/5chan/releases/latest', interpolation: { escapeValue: false } })
        : t('refresh_to_update');
      alert(newVersionText + ' ' + updateActionText);
      updateAvailable = true;
    }

    if (commitRef && commitRef.length > 0) {
      const commitRes = await fetch('https://api.github.com/repos/bitsocialhq/5chan/commits?per_page=1&sha=development', { cache: 'no-cache' });
      const commitData = await commitRes.json();

      const latestCommitHash = commitData[0].sha;

      if (latestCommitHash.trim() !== commitRef.trim()) {
        const newVersionText = t('new_development_version', { newCommit: latestCommitHash.slice(0, 7), oldCommit: commitRef.slice(0, 7) }) + ' ' + t('refresh_to_update');
        alert(newVersionText);
        updateAvailable = true;
      }
    }

    if (!updateAvailable) {
      alert(
        commitRef
          ? `${t('latest_development_version', { commit: commitRef.slice(0, 7), link: `${window.location.origin}/#/`, interpolation: { escapeValue: false } })}`
          : `${t('latest_stable_version', { version: packageJson.version })}`,
      );
    }
  } catch (error) {
    alert('Failed to fetch latest version info: ' + error);
  }
};

const CheckForUpdates = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const checkForUpdates = async () => {
    setLoading(true);
    await fetchLatestVersionInfo(t);
    setLoading(false);
  };

  return (
    <button className={styles.checkForUpdatesButton} onClick={checkForUpdates} disabled={loading}>
      {t('check')}
    </button>
  );
};

// prettier-ignore
const availableLanguages = ['ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fil', 'fr', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'mr', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sq', 'sv', 'te', 'th', 'tr', 'uk', 'ur', 'vi', 'zh'];

const InterfaceLanguage = () => {
  const { i18n } = useTranslation();
  const { changeLanguage, language } = i18n;

  const onSelectLanguage = (e: React.ChangeEvent<HTMLSelectElement>) => {
    changeLanguage(e.target.value);
  };

  return (
    <div className={styles.languageSettings}>
      <select value={language} onChange={onSelectLanguage}>
        {availableLanguages.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
    </div>
  );
};

const InterfaceSettings = () => {
  const { t } = useTranslation();
  const { fitExpandedImagesToScreen, setFitExpandedImagesToScreen } = useExpandedMediaStore();
  const { enableInfiniteScroll, setEnableInfiniteScroll } = useFeedViewSettingsStore();

  return (
    <div className={styles.interfaceSettings}>
      <div className={styles.version}>
        {capitalize(t('version'))}: <Version />
      </div>
      <div className={styles.setting}>
        {capitalize(t('update'))}: <CheckForUpdates />
      </div>
      <div className={styles.setting}>
        {capitalize(t('interface_language'))}: <InterfaceLanguage />
      </div>
      <div className={styles.setting}>
        <label>
          <input type='checkbox' checked={fitExpandedImagesToScreen} onChange={(e) => setFitExpandedImagesToScreen(e.target.checked)} />
          {capitalize(t('fit_expanded_images_to_screen'))}
        </label>
        <div className={styles.settingTip}>{capitalize(t('fit_expanded_images_to_screen_tip'))}</div>
      </div>
      <div className={styles.setting}>
        <label>
          <input type='checkbox' checked={enableInfiniteScroll} onChange={(e) => setEnableInfiniteScroll(e.target.checked)} />
          {capitalize(t('enable_infinite_scroll'))}
        </label>
        <div className={styles.settingTip}>{capitalize(t('enable_infinite_scroll_tip'))}</div>
      </div>
    </div>
  );
};

export default memo(InterfaceSettings);
