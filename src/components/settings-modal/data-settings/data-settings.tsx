import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteAccount, exportAccount, importAccount, setActiveAccount, useAccount, useAccounts } from '@bitsocial/bitsocial-react-hooks';
import styles from './data-settings.module.css';
import { getSettingsSectionPath } from '../../../lib/utils/route-utils';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { isElectronRuntime } from '../../../lib/p2p-browser-config';
import useTripcodeStore from '../../../stores/use-tripcode-store';
import { getImportedAccountActiveName, processImportedAccount } from '../../../lib/utils/account-import-utils';
import { copyToClipboard } from '../../../lib/utils/clipboard-utils';
import { selectFileViaInput } from '../../../lib/utils/file-picker-utils';

const isAndroid = Capacitor.getPlatform() === 'android';
const BACKUP_FILE_NAME = '5chan-backup.json';
const SETTINGS_SECTION_ID = 'advanced-settings';

const safeParseJSON = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const withErrorHandling = async <T,>(fn: () => Promise<T>, onError: (e: unknown) => void): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (e) {
    onError(e);
    return undefined;
  }
};

const reportError = (error: unknown) => {
  if (error instanceof Error) {
    alert(error.message);
    console.log(error);
  } else {
    console.error('An unknown error occurred:', error);
  }
};

// 5chan has no user accounts: the hooks library's "account" is this device's posting key with its
// subscriptions and post history, so this section only ever calls it local data or a backup.
// Keyed by the hooks account id so state resets when the active backup changes.
const DataSettingsEditor = ({
  account,
}: {
  account?: { id?: string; name?: string; author?: { address?: string; shortAddress?: string }; signer?: { address?: string }; [key: string]: unknown };
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { accounts, state: accountsState } = useAccounts();
  const navigate = useNavigate();
  const isElectron = isElectronRuntime(window);
  const [hasCopiedIdentifier, setHasCopiedIdentifier] = useState(false);

  const deleteLocalData = async () => {
    const accountName = account?.name;
    if (!accountName) return;
    if (!window.confirm(t('delete_local_data_confirm'))) return;
    if (!window.confirm(t('double_confirm'))) return;
    // If the data survives, so does its tripcode password.
    const deleted = await withErrorHandling(async () => {
      await deleteAccount(accountName);
      return true;
    }, reportError);
    if (!deleted) return;
    // The tripcode password is kept apart from the rest of the local data, so it goes with it here, with
    // the keys derived from it this session.
    const tripcodeInput = account?.id ? useTripcodeStore.getState().inputs[account.id] : undefined;
    if (account?.id) useTripcodeStore.getState().setTripcodeInput(account.id, undefined);
    if (tripcodeInput) {
      void import('../../../lib/tripcode-crypto').then(({ forgetTripcodeKeys }) => forgetTripcodeKeys(tripcodeInput)).catch(() => {});
    }
  };

  const handleDownloadBackup = async () => {
    // Besides posting as the viewer, the key recognizes their posts on any board that tags aliased posts for their author.
    if (!window.confirm(t('download_backup_confirm'))) return;
    const accountString = await withErrorHandling(() => exportAccount(), reportError);
    if (accountString === undefined) return;
    const accountObject = safeParseJSON<Record<string, unknown>>(accountString);
    if (!accountObject) {
      alert('Failed to parse backup');
      return;
    }
    const formattedAccountJson = JSON.stringify(accountObject, null, 2);
    const blob = new Blob([formattedAccountJson], { type: 'application/json' });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = BACKUP_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(fileUrl);
  };

  const handleImportBackup = async () => {
    const file = await selectFileViaInput('.json');
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileContent = e.target?.result ?? reader.result;
      if (typeof fileContent !== 'string') {
        alert('File content is not a string.');
        return;
      }

      const result = await withErrorHandling(async () => {
        const modifiedAccountJson = processImportedAccount(fileContent, isElectron);
        const accountData = JSON.parse(modifiedAccountJson) as { account?: { name?: string } };
        const importedAccountActiveName = getImportedAccountActiveName(accountData.account?.name, accounts);
        await importAccount(modifiedAccountJson);
        if (importedAccountActiveName) {
          await setActiveAccount(importedAccountActiveName);
        }
        return true;
      }, reportError);
      if (result === undefined) return;

      alert(t('backup_imported'));
      if (new URLSearchParams(location.search).get('section') !== SETTINGS_SECTION_ID) {
        navigate(getSettingsSectionPath(location.pathname, SETTINGS_SECTION_ID, location.search), { replace: true });
      }
    };
    reader.readAsText(file);
  };

  // The address this device posts under, which is what a board owner whitelists or gives a moderator role.
  // It is the key's address unless a name was carried over from an older device or another app's backup.
  const identifier = account?.author?.address ?? account?.signer?.address;
  const handleCopyIdentifier = async () => {
    if (!identifier) return;
    const copied = await withErrorHandling(async () => {
      await copyToClipboard(identifier);
      return true;
    }, reportError);
    if (!copied) return;
    setHasCopiedIdentifier(true);
    setTimeout(() => setHasCopiedIdentifier(false), 2000);
  };

  const host = window.electronApi?.isElectron ? 'this desktop app' : isAndroid ? 'this mobile app' : window.location.hostname;
  // A second set of local data only exists after importing a backup, or on a device set up before 5chan
  // dropped its account switcher. It stays reachable here rather than being deleted with its keys.
  const hasSeveralBackups = accounts.length > 1;

  return (
    <div className={styles.setting}>
      <div>
        <button type='button' onClick={handleDownloadBackup}>
          {t('download_backup')}
        </button>{' '}
        <button type='button' disabled={accountsState !== 'succeeded'} onClick={handleImportBackup}>
          {t('import_backup')}
        </button>{' '}
        <button type='button' onClick={() => navigate('/settings/raw-data', { state: { returnTo: location.pathname + location.search + location.hash } })}>
          {t('edit_raw_data')}
        </button>
        <div className={styles.info}>{t('local_data_info', { location: host, interpolation: { escapeValue: false } })}</div>
      </div>
      {hasSeveralBackups && (
        <div>
          <select aria-label={t('several_backups_tip')} value={account?.name} onChange={(e) => setActiveAccount(e.target.value)}>
            {accounts.map((savedAccount) => (
              <option key={savedAccount?.id} value={savedAccount?.name}>
                {savedAccount?.author?.shortAddress}
              </option>
            ))}
          </select>
          <div className={styles.info}>{t('several_backups_tip')}</div>
        </div>
      )}
      <div>
        <button type='button' disabled={!identifier} onClick={handleCopyIdentifier}>
          {hasCopiedIdentifier ? t('copied') : t('copy_bitsocial_identifier')}
        </button>
        <div className={styles.info}>{t('bitsocial_identifier_tip')}</div>
      </div>
      <div>
        <button type='button' className={styles.deleteLocalData} onClick={deleteLocalData}>
          {t('delete_local_data')}
        </button>
      </div>
    </div>
  );
};

const DataSettings = () => {
  const account = useAccount();
  return <DataSettingsEditor key={account?.id} account={account} />;
};

export default memo(DataSettings);
