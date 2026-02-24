import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAccount, deleteAccount, exportAccount, importAccount, setAccount, setActiveAccount, useAccount, useAccounts } from '@plebbit/plebbit-react-hooks';
import stringify from 'json-stringify-pretty-compact';
import styles from './account-settings.module.css';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';

const isAndroid = Capacitor.getPlatform() === 'android';

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

// Inner component keyed by account id so state resets when user switches account
const AccountSettingsEditor = ({
  account,
}: {
  account?: { id?: string; name?: string; author?: { address?: string; shortAddress?: string }; [key: string]: unknown };
}) => {
  const { t } = useTranslation();
  const location = useLocation();

  const accountJson = useMemo(
    () =>
      stringify({
        account: {
          ...account,
          author: { ...account?.author, avatar: undefined },
          plebbit: undefined,
          karma: undefined,
          plebbitReactOptions: undefined,
          unreadNotificationCount: undefined,
        },
      }),
    [account],
  );

  const [text, setText] = useState(() => accountJson);

  const { accounts } = useAccounts();
  const switchToNewAccountRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (switchToNewAccountRef.current && accounts.length > 0) {
      const lastAccount = accounts[accounts.length - 1];
      setActiveAccount(lastAccount.name);
      switchToNewAccountRef.current = false;
    }
  }, [accounts]);

  const handleCreateAccount = async () => {
    const result = await withErrorHandling(
      async () => {
        switchToNewAccountRef.current = true;
        await createAccount();
      },
      (error) => {
        if (error instanceof Error) {
          alert(error.message);
          console.log(error);
        } else {
          console.error('An unknown error occurred:', error);
        }
      },
    );
    void result;
  };

  const _deleteAccount = (accountName: string) => {
    if (!accountName) {
      return;
    } else if (window.confirm(t('delete_confirm', { value: accountName, interpolation: { escapeValue: false } }))) {
      if (window.confirm(t('double_confirm'))) {
        deleteAccount(accountName);
      }
    } else {
      return;
    }
  };

  const saveAccount = async () => {
    const parsed = safeParseJSON<{ account: Record<string, unknown> }>(text);
    if (!parsed?.account) {
      alert('Invalid JSON');
      return;
    }
    const newAccount = parsed.account;
    const result = await withErrorHandling(
      () => setAccount({ ...newAccount, id: account?.id }),
      (error) => {
        if (error instanceof Error) {
          alert(error.message);
          console.log(error);
        } else {
          console.error('An unknown error occurred:', error);
        }
      },
    );
    if (result !== undefined) {
      alert(`Saved ${newAccount.name}`);
    }
  };

  const handleExportAccount = async () => {
    const accountString = await withErrorHandling(
      () => exportAccount(),
      (error) => {
        if (error instanceof Error) {
          alert(error.message);
          console.log(error);
        } else {
          console.error('An unknown error occurred:', error);
        }
      },
    );
    if (accountString === undefined) return;
    const accountObject = safeParseJSON<Record<string, unknown>>(accountString);
    if (!accountObject) {
      alert('Failed to parse account');
      return;
    }
    const formattedAccountJson = JSON.stringify(accountObject, null, 2);
    const blob = new Blob([formattedAccountJson], { type: 'application/json' });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `${account?.name ?? 'account'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(fileUrl);
  };

  const handleImportAccount = async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.onchange = async (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        alert('No file selected.');
        return;
      }
      const file = files[0];

      const reader = new FileReader();
      reader.onload = async (e) => {
        const fileContent = e.target!.result;
        if (typeof fileContent !== 'string') {
          alert('File content is not a string.');
          return;
        }

        const accountData = safeParseJSON<{
          account?: { subplebbits?: Record<string, unknown>; subscriptions?: string[]; author?: { address?: string }; name?: string };
        }>(fileContent);
        if (!accountData) {
          alert('Invalid JSON in file.');
          return;
        }

        if (accountData.account?.subplebbits) {
          const subplebbitAddresses = Object.keys(accountData.account.subplebbits);
          if (!accountData.account.subscriptions) {
            accountData.account.subscriptions = [];
          }
          const uniqueSubscriptions = [...accountData.account.subscriptions];
          for (const address of subplebbitAddresses) {
            if (!uniqueSubscriptions.includes(address)) {
              uniqueSubscriptions.push(address);
            }
          }
          accountData.account.subscriptions = uniqueSubscriptions;
        }

        const modifiedAccountJson = JSON.stringify(accountData);
        const result = await withErrorHandling(
          async () => {
            await importAccount(modifiedAccountJson);
            if (accountData.account?.author?.address) {
              localStorage.setItem('importedAccountAddress', accountData.account.author.address);
            }
            if (accountData.account?.name) {
              await setActiveAccount(accountData.account.name);
            }
          },
          (error) => {
            if (error instanceof Error) {
              alert(error.message);
              console.log(error);
            } else {
              console.error('An unknown error occurred:', error);
            }
          },
        );
        if (result === undefined) return;

        alert(`Imported ${accountData.account?.name}`);
        const currentPath = location.pathname;
        if (!currentPath.includes('/settings#account-settings')) {
          navigate(`${currentPath}#account-settings`, { replace: true });
        }
        window.location.reload();
      };
      reader.readAsText(file);
    };

    fileInput.click();
  };

  const accountsOptions = accounts.map((account) => (
    <option key={account?.id} value={account?.name}>
      u/{account?.author?.shortAddress}
    </option>
  ));

  return (
    <div className={styles.setting}>
      <div>
        <select value={account?.name} onChange={(e) => setActiveAccount(e.target.value)}>
          {accountsOptions}
        </select>
        <button className={styles.createAccount} onClick={handleCreateAccount}>
          {t('create')}
        </button>{' '}
        <button onClick={handleImportAccount}>{t('import')}</button> <button onClick={handleExportAccount}>{t('export')}</button>
        <div className={styles.warning}>
          {t('stored_locally', {
            location: window.electronApi?.isElectron ? 'this desktop app' : isAndroid ? 'this mobile app' : window.location.hostname,
            interpolation: { escapeValue: false },
          })}
        </div>
      </div>
      <div></div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoCorrect='off' autoComplete='off' spellCheck='false' />
      <div>
        <button onClick={saveAccount}>{t('save_changes')}</button> <button onClick={() => setText(accountJson)}>{t('reset_changes')}</button>
        <button className={styles.deleteAccount} onClick={() => _deleteAccount(account?.name ?? '')}>
          {t('delete_account')}
        </button>
      </div>
    </div>
  );
};

const AccountSettings = () => {
  const account = useAccount();
  return <AccountSettingsEditor key={account?.id} account={account} />;
};

export default AccountSettings;
