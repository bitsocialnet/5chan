import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './settings-modal.module.css';
import AccountSettings from './account-settings';
import CryptoAddressSetting from './crypto-address-setting';
import CryptoWalletsSetting from './crypto-wallets-setting';
import InterfaceSettings from './interface-settings';
import MediaHostingSettings from './media-hosting-settings';
import AdvancedSettings from './advanced-settings';
import SubscriptionsSetting from './subscriptions-setting';

const SettingsModal = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const hash = location.hash.slice(1);

  const closeModal = useCallback(() => {
    const newPath = location.pathname.replace(/\/settings$/, '');
    navigate(newPath);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeModal]);

  const [expandAll, setExpandAll] = useState(false);

  const expandAccount = hash === 'account-settings' || hash === 'crypto-address-settings' || hash === 'crypto-wallet-settings';
  const showInterfaceSettings = expandAll || hash === 'interface-settings';
  const showMediaHostingSettings = expandAll || hash === 'media-hosting-settings';
  const showAccountSettings = expandAll || expandAccount;
  const showSubscriptionsSettings = expandAll || hash === 'subscriptions-settings';
  const showAdvancedSettings = expandAll || hash === 'advanced-settings';

  const getExpandedCount = () => {
    return (
      Number(showInterfaceSettings) + Number(showMediaHostingSettings) + Number(showAccountSettings) + Number(showSubscriptionsSettings) + Number(showAdvancedSettings)
    );
  };

  const getExpandedCategoryId = (excludeCategoryId?: string) => {
    if (showInterfaceSettings && 'interface-settings' !== excludeCategoryId) return 'interface-settings';
    if (showMediaHostingSettings && 'media-hosting-settings' !== excludeCategoryId) return 'media-hosting-settings';
    if (showAccountSettings && 'account-settings' !== excludeCategoryId) return 'account-settings';
    if (showSubscriptionsSettings && 'subscriptions-settings' !== excludeCategoryId) return 'subscriptions-settings';
    if (showAdvancedSettings && 'advanced-settings' !== excludeCategoryId) return 'advanced-settings';
    return null;
  };

  const handleCategoryClick = (categoryId: string, isShowing: boolean) => {
    const newState = !isShowing;
    const currentPath = location.pathname;
    const baseSettingsPath = currentPath.split('#')[0];
    const currentExpandedCount = getExpandedCount();

    if (newState) {
      if (currentExpandedCount === 0) {
        navigate(`${baseSettingsPath}#${categoryId}`, { replace: true });
      } else {
        navigate(baseSettingsPath, { replace: true });
      }
    } else {
      if (currentExpandedCount === 1) {
        navigate(baseSettingsPath, { replace: true });
      } else if (currentExpandedCount === 2) {
        const remainingCategory = getExpandedCategoryId(categoryId);
        if (remainingCategory) {
          navigate(`${baseSettingsPath}#${remainingCategory}`, { replace: true });
        }
      }
    }
  };

  const handleExpandAll = () => {
    setExpandAll((prev) => !prev);
    const baseSettingsPath = location.pathname.split('#')[0];
    navigate(baseSettingsPath, { replace: true });
  };

  const handleKeyDown = (handler: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };

  return (
    <>
      <div className={styles.overlay} role='button' tabIndex={0} onClick={closeModal} onKeyDown={handleKeyDown(closeModal)} />
      <div className={styles.settingsModal}>
        <div className={styles.header}>
          <span className={styles.title}>{t('settings')}</span>
          <span className={styles.closeButton} role='button' tabIndex={0} title='close' onClick={closeModal} onKeyDown={handleKeyDown(closeModal)} />
        </div>
        <div className={styles.expandAllSettings}>
          [
          <span role='button' tabIndex={0} onClick={handleExpandAll} onKeyDown={handleKeyDown(handleExpandAll)}>
            {expandAll ? t('collapse_all_settings') : t('expand_all_settings')}
          </span>
          ]
        </div>
        <div id='interface-settings' className={`${styles.setting} ${styles.category}`}>
          <label onClick={() => handleCategoryClick('interface-settings', showInterfaceSettings)}>
            <span className={showInterfaceSettings ? styles.hideButton : styles.showButton} />
            {t('interface')}
          </label>
        </div>
        {showInterfaceSettings && <InterfaceSettings />}
        <div id='media-hosting-settings' className={`${styles.setting} ${styles.category}`}>
          <label onClick={() => handleCategoryClick('media-hosting-settings', showMediaHostingSettings)}>
            <span className={showMediaHostingSettings ? styles.hideButton : styles.showButton} />
            {t('media_hosting')}
          </label>
        </div>
        {showMediaHostingSettings && <MediaHostingSettings />}
        <div id='account-settings' className={`${styles.setting} ${styles.category}`}>
          <label onClick={() => handleCategoryClick('account-settings', showAccountSettings)}>
            <span className={showAccountSettings ? styles.hideButton : styles.showButton} />
            {t('bitsocial_account')}
          </label>
        </div>
        {showAccountSettings && (
          <>
            <AccountSettings />
            <div className={styles.subSectionHeader}>{t('crypto_address')}</div>
            <CryptoAddressSetting />
            <div className={styles.subSectionHeader}>{t('crypto_wallets')}</div>
            <CryptoWalletsSetting />
          </>
        )}
        <div id='subscriptions-settings' className={`${styles.setting} ${styles.category}`}>
          <label onClick={() => handleCategoryClick('subscriptions-settings', showSubscriptionsSettings)}>
            <span className={showSubscriptionsSettings ? styles.hideButton : styles.showButton} />
            {t('board_subscriptions')}
          </label>
        </div>
        {showSubscriptionsSettings && <SubscriptionsSetting />}
        <div id='advanced-settings' className={`${styles.setting} ${styles.category}`}>
          <label onClick={() => handleCategoryClick('advanced-settings', showAdvancedSettings)}>
            <span className={showAdvancedSettings ? styles.hideButton : styles.showButton} />
            {t('advanced_settings')}
          </label>
        </div>
        {showAdvancedSettings && <AdvancedSettings />}
      </div>
    </>
  );
};

export default SettingsModal;
