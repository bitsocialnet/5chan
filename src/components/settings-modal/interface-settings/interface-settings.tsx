import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAvatarVisibilityStore from '../../../stores/use-avatar-visibility-store';
import useTheme from '../../../hooks/use-theme';
import packageJson from '../../../../package.json';
import styles from './interface-settings.module.css';
import { capitalize } from 'lodash';
import useInterfaceSettingsStore from '../../../stores/use-interface-settings-store';
import useCatalogFiltersStore from '../../../stores/use-catalog-filters-store';
import useExpandedMediaStore from '../../../stores/use-expanded-media-store';
import useSpecialThemeStore from '../../../stores/use-special-theme-store';
import { isChristmas } from '../../../lib/utils/time-utils';
import Version from '../../version';

const commitRef = process.env.VITE_COMMIT_REF;
const isElectron = window.electronApi?.isElectron === true;

const CheckForUpdates = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const checkForUpdates = async () => {
    try {
      setLoading(true);
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
          const newVersionText =
            t('new_development_version', { newCommit: latestCommitHash.slice(0, 7), oldCommit: commitRef.slice(0, 7) }) + ' ' + t('refresh_to_update');
          alert(newVersionText);
          updateAvailable = true;
        }
      }

      if (!updateAvailable) {
        alert(
          commitRef
            ? `${t('latest_development_version', { commit: commitRef.slice(0, 7), link: 'https://5chan.app/#/', interpolation: { escapeValue: false } })}`
            : `${t('latest_stable_version', { version: packageJson.version })}`,
        );
      }
    } catch (error) {
      alert('Failed to fetch latest version info: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className={styles.checkForUpdatesButton} onClick={checkForUpdates} disabled={loading}>
      {t('check')}
    </button>
  );
};

const Style = () => {
  const [theme, setTheme] = useTheme();
  const { isEnabled, setIsEnabled } = useSpecialThemeStore();
  const isChristmasTime = isChristmas();

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = e.target.value;

    if (newTheme === 'special') {
      setIsEnabled(true);
      setTheme('tomorrow');
    } else {
      setIsEnabled(false);
      setTheme(newTheme);
    }
  };

  return (
    <select className={styles.themeSettings} value={isEnabled ? 'special' : theme} onChange={handleThemeChange}>
      <option value='yotsuba'>Yotsuba</option>
      <option value='yotsuba-b'>Yotsuba B</option>
      <option value='futaba'>Futaba</option>
      <option value='burichan'>Burichan</option>
      <option value='tomorrow'>Tomorrow</option>
      <option value='photon'>Photon</option>
      {isChristmasTime && <option value='special'>Special</option>}
    </select>
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
  const { hideAvatars, setHideAvatars } = useAvatarVisibilityStore();
  const { hideThreadsWithoutImages, setHideThreadsWithoutImages } = useInterfaceSettingsStore();
  const { setShowTextOnlyThreads } = useCatalogFiltersStore();
  const { fitExpandedImagesToScreen, setFitExpandedImagesToScreen } = useExpandedMediaStore();

  const handleHideAvatarsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHideAvatars(e.target.checked);
  };

  return (
    <div className={styles.interfaceSettings}>
      <div className={styles.version}>
        {capitalize(t('version'))}: <Version />
      </div>
      <div className={styles.setting}>
        {capitalize(t('update'))}: <CheckForUpdates />
      </div>
      <div className={styles.setting}>
        {capitalize(t('style'))}: <Style />
      </div>
      <div className={styles.setting}>
        {capitalize(t('interface_language'))}: <InterfaceLanguage />
      </div>
      <div className={styles.setting}>
        <label>
          <input
            type='checkbox'
            checked={hideThreadsWithoutImages}
            onChange={(e) => {
              setHideThreadsWithoutImages(e.target.checked);
              setShowTextOnlyThreads(!e.target.checked);
            }}
          />
          {capitalize(t('hide_threads_without_images'))}
        </label>
        <div className={styles.settingTip}>{capitalize(t('threads_without_images_tip'))}</div>
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
          <input type='checkbox' checked={hideAvatars} onChange={handleHideAvatarsChange} /> {capitalize(t('hide_avatars'))}
        </label>
        <div className={styles.settingTip}>{capitalize(t('hide_avatars_tip'))}</div>
      </div>
    </div>
  );
};

export default InterfaceSettings;
