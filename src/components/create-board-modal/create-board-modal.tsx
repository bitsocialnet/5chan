import { FormEvent, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAccount, usePkcRpcSettings } from '@bitsocial/bitsocial-react-hooks';
import type { PkcRpcChallengeSettings } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore as useAccountsStore } from '../../lib/bitsocial-internals/stores';
import { BOARD_MANAGER_URL, SPAM_BLOCKER_CHALLENGE_NAME } from '../../data/board-defaults';
import { buildCreateBoardOptions, CreateBoardFormValues } from '../../lib/utils/board-settings-utils';
import { getBoardPath, getSettingsSectionPath } from '../../lib/utils/route-utils';
import { useDirectories } from '../../hooks/use-directories';
import useCreateBoardModalStore from '../../stores/use-create-board-modal-store';
import LoadingEllipsis from '../loading-ellipsis';
import styles from './create-board-modal.module.css';

type CreatedCommunity = { address?: string; start?: () => Promise<void> };
type CreateCommunityAction = (createCommunityOptions: Record<string, unknown>, accountName?: string) => Promise<CreatedCommunity | undefined>;
type SubscribeAction = (communityAddress: string, accountName?: string) => Promise<void>;

type CreateStatus = { type: 'idle' } | { type: 'creating' } | { type: 'error'; message: string };
type CreatedBoardResult = { address: string; startError?: string };

const BoardManagerNotice = () => (
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
);

const NodeRequiredNotice = () => {
  const { pathname, search } = useLocation();
  const settingsPath = getSettingsSectionPath(`${pathname.replace(/\/$/, '')}/settings`, 'advanced-settings', search);

  return (
    <div className={styles.section}>
      <p>
        <Trans i18nKey='create_board_requires_node' components={{ 1: <Link to={settingsPath} /> }} />
      </p>
    </div>
  );
};

const CreatedBoard = ({ address, startError }: CreatedBoardResult) => {
  const { t } = useTranslation();
  const directories = useDirectories();

  return (
    <div className={styles.section}>
      <p>
        <strong>{t('create_board_created')}</strong> <span className={styles.address}>{address}</span>
      </p>
      {startError && <p className={styles.error}>{t('create_board_start_failed', { error: startError, interpolation: { escapeValue: false } })}</p>}
      <p>{t('create_board_keep_online')}</p>
      <p>
        <BoardManagerNotice />
      </p>
      {/* The app already applied (or the user declined) the 5chan defaults; without a defaults flag `board add` fails outside a TTY. */}
      <pre className={styles.command}>5chan board add {address} --skip-apply-defaults</pre>
      <p>
        [<Link to={`/${getBoardPath(address, directories)}`}>{t('go_to_board')}</Link>]
      </p>
    </div>
  );
};

const ChallengeOptionInputs = ({
  challenge,
  values,
  onChange,
}: {
  challenge: PkcRpcChallengeSettings | undefined;
  values: Record<string, string>;
  onChange: (option: string, value: string) => void;
}) => (
  <>
    {challenge?.description && <div className={styles.fieldTip}>{challenge.description}</div>}
    {challenge?.optionInputs?.map((input) => (
      <label key={input.option} className={styles.challengeOption}>
        <span>
          {input.label}
          {input.required && ' *'}
        </span>
        <input
          type='text'
          value={values[input.option] ?? ''}
          placeholder={input.placeholder || input.default}
          required={input.required}
          onChange={(e) => onChange(input.option, e.target.value)}
        />
        {input.description && <span className={styles.fieldTip}>{input.description}</span>}
      </label>
    ))}
  </>
);

const CreateBoardForm = ({
  availableChallenges,
  onCreated,
}: {
  availableChallenges: Record<string, PkcRpcChallengeSettings>;
  onCreated: (result: CreatedBoardResult) => void;
}) => {
  const { t } = useTranslation();
  const account = useAccount();
  const accountAddress: string | undefined = account?.author?.address;
  const createCommunity = useAccountsStore((state) => state.accountsActions.createCommunity) as CreateCommunityAction;
  const subscribe = useAccountsStore((state) => state.accountsActions.subscribe) as SubscribeAction;
  const challengeNames = Object.keys(availableChallenges);

  // challengeName stays undefined until the user picks one, so the default follows the node's
  // challenge list even when it loads after the form opens.
  const [formState, setForm] = useState<Omit<CreateBoardFormValues, 'challengeName'> & { challengeName?: string }>({
    title: '',
    description: '',
    rules: '',
    moderators: '',
    challengeOptions: {},
    useBoardDefaults: true,
  });
  const form: CreateBoardFormValues = {
    ...formState,
    challengeName: formState.challengeName ?? (challengeNames.includes(SPAM_BLOCKER_CHALLENGE_NAME) ? SPAM_BLOCKER_CHALLENGE_NAME : ''),
  };
  const [status, setStatus] = useState<CreateStatus>({ type: 'idle' });
  const setField = <K extends keyof CreateBoardFormValues>(field: K, value: CreateBoardFormValues[K]) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: 'creating' });
    try {
      const community = await createCommunity(buildCreateBoardOptions(form, accountAddress));
      if (!community?.address) {
        throw new Error('missing board address');
      }
      // Creating only writes the board to the node; it publishes and accepts posts once started, and the node
      // restarts started boards on boot. A failed start must not hide the board that now exists.
      let startError: string | undefined;
      try {
        await community.start?.();
      } catch (error) {
        startError = error instanceof Error ? error.message : String(error);
      }
      // Subscribe so the new board shows in the subscriptions feed; a failure here must not hide the new board.
      await subscribe(community.address).catch((error: unknown) => console.warn('Failed to subscribe to the new board:', error));
      onCreated({ address: community.address, startError });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ type: 'error', message: t('create_board_failed', { error: message, interpolation: { escapeValue: false } }) });
    }
  };

  const isCreating = status.type === 'creating';

  return (
    <form className={styles.section} onSubmit={handleSubmit}>
      <table className={styles.formTable}>
        <tbody>
          <tr>
            <td>
              <label htmlFor='create-board-title'>{t('create_board_title_field')}</label>
            </td>
            <td>
              <input id='create-board-title' type='text' value={form.title} onChange={(e) => setField('title', e.target.value)} />
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor='create-board-description'>{t('create_board_description_field')}</label>
            </td>
            <td>
              <textarea id='create-board-description' rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor='create-board-rules'>{t('create_board_rules_field')}</label>
            </td>
            <td>
              <textarea
                id='create-board-rules'
                rows={3}
                value={form.rules}
                placeholder={t('create_board_rules_placeholder')}
                onChange={(e) => setField('rules', e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor='create-board-moderators'>{t('create_board_moderators_field')}</label>
            </td>
            <td>
              <textarea
                id='create-board-moderators'
                rows={2}
                value={form.moderators}
                placeholder={t('create_board_moderators_placeholder')}
                autoCapitalize='off'
                autoCorrect='off'
                spellCheck={false}
                onChange={(e) => setField('moderators', e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <td>
              <label htmlFor='create-board-challenge'>{t('create_board_challenge_field')}</label>
            </td>
            <td>
              <select
                id='create-board-challenge'
                value={form.challengeName}
                onChange={(e) => setForm((current) => ({ ...current, challengeName: e.target.value, challengeOptions: {} }))}
              >
                <option value=''>{t('none')}</option>
                {challengeNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {form.challengeName ? (
                <ChallengeOptionInputs
                  challenge={availableChallenges[form.challengeName]}
                  values={form.challengeOptions}
                  onChange={(option, value) => setForm((current) => ({ ...current, challengeOptions: { ...current.challengeOptions, [option]: value } }))}
                />
              ) : (
                <div className={styles.fieldTip}>{t('create_board_no_challenge_tip')}</div>
              )}
            </td>
          </tr>
          <tr>
            <td>{t('create_board_defaults_field')}</td>
            <td>
              <label className={styles.checkboxLabel}>
                <input type='checkbox' checked={form.useBoardDefaults} onChange={(e) => setField('useBoardDefaults', e.target.checked)} />
                {t('create_board_defaults_label')}
              </label>
              <div className={styles.fieldTip}>{t('create_board_defaults_tip')}</div>
            </td>
          </tr>
        </tbody>
      </table>
      {accountAddress && <p className={styles.fieldTip}>{t('create_board_owner_notice', { address: accountAddress, interpolation: { escapeValue: false } })}</p>}
      <p>
        <BoardManagerNotice />
      </p>
      <div className={styles.submitRow}>
        <button type='submit' disabled={isCreating}>
          {t('create_board')}
        </button>
        {isCreating && <LoadingEllipsis string={t('create_board_creating')} />}
        {status.type === 'error' && <span className={styles.error}>{status.message}</span>}
      </div>
    </form>
  );
};

const CreateBoardDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const account = useAccount();
  const { pkcRpcSettings, state: rpcState } = usePkcRpcSettings();
  // The desktop app runs a full node and connects to it over RPC, so one check covers both setups.
  const isConnectedToNode = rpcState === 'connected';
  // The hook reports 'initializing' until it attaches to an RPC client, and forever when none is configured.
  const hasNodeRpc = Boolean(account?.pkcOptions?.pkcRpcClientsOptions?.length);
  const isConnectingToNode = hasNodeRpc && !isConnectedToNode && rpcState !== 'failed';
  const [createdBoard, setCreatedBoard] = useState<CreatedBoardResult>();

  return (
    <div className={styles.backdrop}>
      <button type='button' className={styles.backdropButton} aria-label='Close create board modal' onClick={onClose} />
      <dialog open className={styles.createBoardDialog} aria-modal='true' aria-labelledby='create-board-modal-title'>
        <div className={styles.hd}>
          <h2 id='create-board-modal-title'>{t('create_a_board')}</h2>
          <button type='button' className={styles.closeButton} onClick={onClose} title={t('close')} aria-label={t('close')} />
        </div>
        <div className={styles.bd}>
          {createdBoard ? (
            <CreatedBoard {...createdBoard} />
          ) : isConnectedToNode ? (
            <CreateBoardForm availableChallenges={pkcRpcSettings?.challenges ?? {}} onCreated={setCreatedBoard} />
          ) : isConnectingToNode ? (
            <div className={styles.section}>
              <LoadingEllipsis string={t('loading')} />
            </div>
          ) : (
            <NodeRequiredNotice />
          )}

          <div className={styles.section}>
            <h3>Building a Following</h3>
            <p>
              Users can subscribe to your board via the &quot;[Subscribe]&quot; button, which adds it to their top bar. You can gain subscribers through direct links,
              word of mouth, or search, no directory assignment or dev approval needed.
            </p>
          </div>

          <div className={styles.section}>
            <h3>Submitting to a Directory</h3>
            <p>
              Open a PR editing the relevant file in the{' '}
              <a href='https://github.com/bitsocialnet/lists/tree/master/5chan-directories' target='_blank' rel='noopener noreferrer'>
                5chan-directories folder
              </a>{' '}
              with your board&apos;s title, address, and NSFW status. Devs will review and merge if approved. 99% uptime is required.
            </p>
          </div>

          <div className={styles.section}>
            <h3>Future: Directory Voting</h3>
            <p>
              Each directory will have its own voting page listing the boards competing for that slot. 5chan Pass holders will be able to participate in directory voting,
              while final governance mechanics are still being designed to include BSO-holder alignment.
            </p>
          </div>

          <div className={styles.section}>
            <h3>Decentralization</h3>
            <p>
              Devs can change directories via commits in the open-source repo. No centralized servers; anyone can fork, modify, and redeploy to their own domain. 5chan is
              adminless with no central authority.
            </p>
          </div>
        </div>
        <div className={styles.createBoardFooter}>
          <button type='button' onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </dialog>
    </div>
  );
};

const CreateBoardModal = () => {
  const { showModal, closeCreateBoardModal } = useCreateBoardModalStore();

  // Mounting the dialog only while open resets the form each time the modal opens.
  return showModal ? <CreateBoardDialog onClose={closeCreateBoardModal} /> : null;
};

export default CreateBoardModal;
