import { useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChallengeVerification, CommunitySyncState, useAccount, useCommunity, usePublishCommunityEdit } from '@bitsocial/bitsocial-react-hooks';
import { BOARD_MANAGER_URL } from '../../data/board-defaults';
import { EditableBoardSettings, getBoardSettingsEdit, getEditableBoardKeys, getEditableBoardSettings } from '../../lib/utils/board-settings-utils';
import { isCommunitySyncTerminal } from '../../lib/utils/community-freshness-utils';
import { canEditBoardSettings } from '../../lib/utils/mod-access';
import { getChallengeVerificationErrorMessages } from '../../lib/utils/challenge-utils';
import { getBoardPath } from '../../lib/utils/route-utils';
import useChallengesStore from '../../stores/use-challenges-store';
import { useDirectories } from '../../hooks/use-directories';
import { useCommunityIdentifier } from '../../hooks/use-community-identifiers';
import { useResolvedCommunityAddress } from '../../hooks/use-resolved-community-address';
import ErrorDisplay from '../../components/error-display';
import JsonEditor from '../../components/json-editor';
import LoadingEllipsis from '../../components/loading-ellipsis';
import styles from './board-settings.module.css';

type SaveStatus = { type: 'idle' } | { type: 'saving' } | { type: 'saved' } | { type: 'error'; message: string };
// The draft keeps the settings it was started from, so a board update that arrives while editing is
// neither reverted by the save nor reported as a removal the user never made.
type Draft = { text: string; baseline: EditableBoardSettings };

type PageState = 'loading' | 'offline' | 'not-allowed' | 'editor';
// A cached record can predate a role change, so access is denied only after a fresh fetch or a settled lookup.
const getPageState = (
  community: { updatedAt?: number; syncState?: CommunitySyncState; lastSuccessfulFetchAt?: number } | undefined,
  isHosted: boolean,
  canEdit: boolean,
): PageState => {
  const isLookupSettled = isCommunitySyncTerminal(community?.syncState);
  if (!isHosted && !community?.updatedAt) return isLookupSettled ? 'offline' : 'loading';
  if (canEdit) return 'editor';
  return isLookupSettled || community?.lastSuccessfulFetchAt !== undefined ? 'not-allowed' : 'loading';
};

const BoardSettings = ({ boardIdentifier, communityAddress }: { boardIdentifier: string | undefined; communityAddress: string | undefined }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const directories = useDirectories();
  const account = useAccount();
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);

  const accountAddress = account?.author?.address;
  const accountRole = accountAddress ? community?.roles?.[accountAddress]?.role : undefined;
  // pkc-js only exposes private settings to the node that hosts the board.
  const isHostedOnConnectedNode = Boolean(community?.settings);
  const pageState = getPageState(community, isHostedOnConnectedNode, canEditBoardSettings(accountRole, isHostedOnConnectedNode));
  const boardPath = communityAddress ? getBoardPath({ address: communityAddress, communities: directories }) : boardIdentifier;

  const editableKeys = useMemo(() => getEditableBoardKeys(isHostedOnConnectedNode), [isHostedOnConnectedNode]);
  const baseline = useMemo(() => getEditableBoardSettings(community, editableKeys), [community, editableKeys]);
  const baselineText = useMemo(() => JSON.stringify(baseline, null, 2), [baseline]);
  // Until the user edits, the editor follows the live board so it never shows stale settings.
  const [draft, setDraft] = useState<Draft | undefined>();
  const text = draft?.text ?? baselineText;
  const editBaseline = draft?.baseline ?? baseline;
  const editResult = useMemo(
    () => getBoardSettingsEdit(editBaseline, text, editableKeys, isHostedOnConnectedNode),
    [editBaseline, text, editableKeys, isHostedOnConnectedNode],
  );
  const handleEditorChange = (nextText: string) => setDraft((current) => ({ text: nextText, baseline: current?.baseline ?? baseline }));

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: 'idle' });

  // Closing the challenge without answering ends this save attempt, so the form becomes editable again.
  const onChallenge = useCallback(async (...args: unknown[]) => useChallengesStore.getState().addChallenge(args, () => setSaveStatus({ type: 'idle' })), []);
  const onChallengeVerification = useCallback(
    async (challengeVerification: ChallengeVerification) => {
      if (challengeVerification?.challengeSuccess) {
        // The editor is read-only while saving, so the draft text is what was saved; later edits diff against it.
        setDraft((current) => current && { text: current.text, baseline: { ...current.baseline, ...JSON.parse(current.text) } });
        setSaveStatus({ type: 'saved' });
        return;
      }
      const message = getChallengeVerificationErrorMessages(challengeVerification).join(' ') || t('error');
      setSaveStatus({ type: 'error', message: t('board_settings_save_failed', { error: message, interpolation: { escapeValue: false } }) });
    },
    [t],
  );
  const onError = useCallback(
    (error: Error) => setSaveStatus({ type: 'error', message: t('board_settings_save_failed', { error: error.message, interpolation: { escapeValue: false } }) }),
    [t],
  );

  const { publishCommunityEdit } = usePublishCommunityEdit({
    communityAddress,
    ...(editResult.ok ? editResult.edit : {}),
    onChallenge,
    onChallengeVerification,
    onError,
  });

  const handleSave = async () => {
    if (!editResult.ok) {
      const message =
        editResult.error === 'unknown_field'
          ? t('board_settings_unknown_field', { field: editResult.field, interpolation: { escapeValue: false } })
          : editResult.error === 'remote_removal'
            ? t('board_settings_remote_removal', { field: editResult.field, interpolation: { escapeValue: false } })
            : t('board_settings_invalid_json');
      setSaveStatus({ type: 'error', message });
      return;
    }
    if (Object.keys(editResult.edit).length === 0) {
      setSaveStatus({ type: 'error', message: t('board_settings_no_changes') });
      return;
    }
    setSaveStatus({ type: 'saving' });
    await publishCommunityEdit();
  };

  const handleReset = () => {
    setDraft(undefined);
    setSaveStatus({ type: 'idle' });
  };

  if (pageState === 'offline') {
    return (
      <div className={styles.container}>
        <div className={styles.loadingMessage}>{t('community_offline_info')}</div>
        <ErrorDisplay error={community?.error} />
      </div>
    );
  }

  if (pageState === 'not-allowed') {
    return <Navigate to='/not-allowed' replace />;
  }

  if (pageState === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.loadingMessage}>
          <LoadingEllipsis string={t('loading')} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('board_settings')}</h1>
        <div className={styles.boardName}>
          /{boardPath}/{community?.title ? ` - ${community.title}` : ''}
        </div>
      </div>
      <div className={styles.notice}>{isHostedOnConnectedNode ? t('board_settings_hosted_notice') : t('board_settings_remote_notice')}</div>
      <div className={styles.notice}>
        <Trans
          i18nKey='board_manager_notice'
          components={{
            1: (
              <a href={BOARD_MANAGER_URL} target='_blank' rel='noopener noreferrer'>
                5chan Board Manager
              </a>
            ),
          }}
        />
      </div>
      <JsonEditor value={text} onChange={handleEditorChange} ariaLabel={t('board_settings')} readOnly={saveStatus.type === 'saving'} />
      <div className={styles.controls}>
        <button type='button' onClick={handleSave} disabled={saveStatus.type === 'saving'}>
          {t('save_changes')}
        </button>
        <button type='button' onClick={handleReset} disabled={saveStatus.type === 'saving'}>
          {t('reset_changes')}
        </button>
        <button type='button' onClick={() => navigate(`/${boardPath}`)}>
          {t('return_to_board')}
        </button>
      </div>
      <div className={styles.status} role='status'>
        {saveStatus.type === 'saving' && <LoadingEllipsis string={t('board_settings_saving')} />}
        {saveStatus.type === 'saved' && t('board_settings_saved')}
        {saveStatus.type === 'error' && <span className={styles.error}>{saveStatus.message}</span>}
      </div>
    </div>
  );
};

// Keyed by the resolved board, not the URL: a directory URL such as /mu/ can switch to another board,
// and an unsaved draft must never be published to a board it was not written for.
const BoardSettingsRoute = () => {
  const { boardIdentifier } = useParams();
  const communityAddress = useResolvedCommunityAddress();
  return <BoardSettings key={communityAddress ?? boardIdentifier} boardIdentifier={boardIdentifier} communityAddress={communityAddress} />;
};

export default BoardSettingsRoute;
