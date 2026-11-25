import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getEthWalletFromPkcPrivateKey, setAccount, useAccount, validateEthWallet } from '@bitsocial/bitsocial-react-hooks';
import HomeLogo from '../../components/home-logo';
import { copyToClipboard } from '../../lib/utils/clipboard-utils';
import { getPassLoginWalletAddress, getPassWalletMessage, isEthWalletAddress, type PassWallet } from '../../lib/utils/pass-wallet-utils';
import styles from './pass-auth.module.css';

type LoginError = 'invalid_address' | 'invalid_signature' | 'failed';

const ERROR_KEYS: Record<LoginError, string> = {
  invalid_address: 'pass_auth_invalid_address',
  invalid_signature: 'pass_auth_invalid_signature',
  failed: 'error',
};

// 5chan's counterpart of sys.4chan.org/auth. A 5chan Pass is an NFT, so the login is the wallet that
// holds it plus a signature proving the wallet agreed to be used by this device; there is no server
// session, the proof is stored on the device and sent to a board with each post.
const PassAuth = () => {
  const { t } = useTranslation();
  const account = useAccount();
  // The proof names the device's key address, which stays the same when author.address is a name.
  const authorPublicKey: string | undefined = account?.signer?.address;
  // A login signed before BSIP-22 never shows here: bitsocial-react-hooks replaces a wallet whose proof is not
  // valid with the device's own wallet when the account loads, which logs the device out.
  const loggedInWalletAddress = getPassLoginWalletAddress(account);

  const [walletAddress, setWalletAddress] = useState('');
  const [signature, setSignature] = useState('');
  // Fixed when the form first asks for a signature, so the message the wallet signed is the one checked.
  const [timestamp] = useState(() => Math.floor(Date.now() / 1000));
  const [hasCopied, setHasCopied] = useState(false);
  const [error, setError] = useState<LoginError>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = t('pass_auth_document_title');
  }, [t]);

  const message = getPassWalletMessage(authorPublicKey, walletAddress.trim(), timestamp);

  const handleCopyMessage = async () => {
    try {
      await copyToClipboard(message);
    } catch {
      // The message is also shown in the form, so it can still be selected and copied by hand.
      return;
    }
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || !authorPublicKey) return;
    const address = walletAddress.trim();
    if (!isEthWalletAddress(address)) {
      setError('invalid_address');
      return;
    }
    const wallet: PassWallet = { address, timestamp, signature: { signature: signature.trim(), type: 'eip191' } };
    setError(undefined);
    setIsSaving(true);
    try {
      await validateEthWallet(wallet, authorPublicKey);
    } catch {
      setError('invalid_signature');
      setIsSaving(false);
      return;
    }
    try {
      await setAccount({ ...account, author: { ...account.author, wallets: { ...account.author?.wallets, eth: wallet } } });
      setWalletAddress('');
      setSignature('');
    } catch (saveError) {
      console.error(saveError);
      setError('failed');
    }
    setIsSaving(false);
  };

  const handleLogout = async () => {
    if (!account) return;
    setError(undefined);
    setIsSaving(true);
    try {
      // Logging out puts back the wallet derived from the device's own key, which is what a device that
      // never logged in has.
      const builtInWallet = account.signer?.privateKey ? await getEthWalletFromPkcPrivateKey(account.signer.privateKey) : undefined;
      const { eth: _loggedInWallet, ...otherWallets } = account.author?.wallets ?? {};
      await setAccount({ ...account, author: { ...account.author, wallets: builtInWallet ? { ...otherWallets, eth: builtInWallet } : otherWallets } });
    } catch (saveError) {
      console.error(saveError);
      setError('failed');
    }
    setIsSaving(false);
  };

  return (
    <div className={styles.content}>
      <HomeLogo />
      <h1 className={styles.title}>5chan Pass</h1>
      {loggedInWalletAddress ? (
        <div className={styles.loggedIn}>
          <p>{t('pass_auth_logged_in', { address: loggedInWalletAddress, interpolation: { escapeValue: false } })}</p>
          <button type='button' disabled={isSaving} onClick={handleLogout}>
            {t('log_out')}
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleLogin}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <th scope='row'>
                  <label htmlFor='pass-auth-wallet'>{t('wallet_address')}</label>
                </th>
                <td>
                  <input
                    id='pass-auth-wallet'
                    type='text'
                    value={walletAddress}
                    onChange={(event) => setWalletAddress(event.target.value)}
                    placeholder='0x...'
                    autoCorrect='off'
                    autoCapitalize='off'
                    autoComplete='off'
                    spellCheck='false'
                    required
                  />
                </td>
              </tr>
              <tr>
                <th scope='row'>
                  <label htmlFor='pass-auth-message'>{t('pass_auth_message')}</label>
                </th>
                <td>
                  <textarea id='pass-auth-message' value={message} placeholder={t('pass_auth_message_placeholder')} rows={4} readOnly />
                  <div className={styles.fieldTip}>
                    <Trans
                      i18nKey='copy_message_etherscan'
                      components={{
                        1: <button type='button' key='copy-message-button' onClick={handleCopyMessage} disabled={!message} />,
                        // eslint-disable-next-line
                        2: <a key='etherscan-link' href='https://etherscan.io/verifiedSignatures' target='_blank' rel='noopener noreferrer' />,
                      }}
                      values={{ copy: hasCopied ? t('copied') : t('copy') }}
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <th scope='row'>
                  <label htmlFor='pass-auth-signature'>{t('pass_auth_signature')}</label>
                </th>
                <td>
                  <input
                    id='pass-auth-signature'
                    type='text'
                    value={signature}
                    onChange={(event) => setSignature(event.target.value)}
                    placeholder='0x...'
                    autoCorrect='off'
                    autoCapitalize='off'
                    autoComplete='off'
                    spellCheck='false'
                    required
                  />
                </td>
              </tr>
              <tr>
                <td colSpan={2} className={styles.submitCell}>
                  <button type='submit' disabled={isSaving || !authorPublicKey}>
                    {t('submit')}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </form>
      )}
      {error && (
        <p className={styles.error} role='alert'>
          {t(ERROR_KEYS[error])}
        </p>
      )}
      <hr className={styles.separator} />
      <p className={styles.note}>{t('pass_auth_privacy')}</p>
      <p className={styles.note}>
        <Trans i18nKey='pass_auth_no_pass' components={{ 1: <Link to='/pass' /> }} />
      </p>
    </div>
  );
};

export default PassAuth;
