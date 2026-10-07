import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { setAccount, useAccount } from '@bitsocial/bitsocial-react-hooks';
import { buildEditableAccountJson, safeParseAccountJson, buildSavePayload } from '../../lib/utils/account-editor-utils';
import JsonEditor from '../../components/json-editor';
import styles from './account-data-editor.module.css';

const DEFAULT_RETURN_TO = '/subs/settings?section=account-settings';

type EditorState = { phase: 'warning' | 'editor'; text: string };

const AccountDataEditor = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const account = useAccount();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? DEFAULT_RETURN_TO;

  const [{ phase, text }, setEditorState] = useState<EditorState>({ phase: 'warning', text: '' });

  const handleGoBack = () => navigate(returnTo);
  const handleContinue = () => setEditorState({ phase: 'editor', text: buildEditableAccountJson(account) });
  const handleReset = () => setEditorState((current) => ({ ...current, text: buildEditableAccountJson(account) }));
  const handleReturn = () => navigate(returnTo);

  const handleSave = async () => {
    const parsed = safeParseAccountJson(text);
    if (!parsed) {
      alert('Invalid JSON');
      return;
    }
    const payload = buildSavePayload(parsed, account?.id);
    try {
      await setAccount(payload);
      navigate(returnTo);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error saving');
    }
  };

  if (phase === 'warning') {
    return (
      <div className={styles.container}>
        <div className={styles.warningGate}>
          <div className={styles.warningTitle}>{t('private_key_warning_title')}</div>
          <div className={styles.warningDescription}>{t('private_key_warning_description')}</div>
          <div className={styles.warningButtons}>
            <button type='button' onClick={handleGoBack}>
              {t('go_back')}
            </button>
            <button type='button' onClick={handleContinue}>
              {t('continue')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <JsonEditor value={text} onChange={(nextText) => setEditorState((current) => ({ ...current, text: nextText }))} ariaLabel={t('account_data')} />
      <div className={styles.controls}>
        <button type='button' onClick={handleSave}>
          {t('save_changes')}
        </button>
        <button type='button' onClick={handleReset}>
          {t('reset_changes')}
        </button>
        <button type='button' onClick={handleReturn}>
          {t('return_to_settings')}
        </button>
      </div>
    </div>
  );
};

export default AccountDataEditor;
