import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { autoUpdate, FloatingFocusManager, FloatingPortal, offset, shift, useDismiss, useFloating, useId, useInteractions, useRole } from '@floating-ui/react';
import {
  Comment,
  PublishCommentEditOptions,
  useAccount,
  usePublishCommentEdit,
  usePublishCommentModeration,
  PublishCommentModerationOptions,
} from '@bitsocial/bitsocial-react-hooks';
import styles from './edit-menu.module.css';
import { alertChallengeVerificationFailed } from '../../lib/utils/challenge-utils';
import { isCommentArchived } from '../../lib/utils/comment-moderation-utils';
import { alertPublishFailure, onFinalPublishError } from '../../lib/utils/publish-error-utils';
import useChallengesStore from '../../stores/use-challenges-store';
import capitalize from 'lodash/capitalize';
import useIsMobile from '../../hooks/use-is-mobile';
import useAuthorPrivileges from '../../hooks/use-author-privileges';
import { useBoardPseudonymityMode } from '../../hooks/use-board-pseudonymity-mode';
import { useBoardHasArchive } from '../../hooks/use-board-has-archive';
import { getCommentCommunityAddress, withResolvedCommentCommunityAddress } from '../../lib/utils/comment-utils';
import usePostTransfer from '../../hooks/use-post-transfer';

const alertFailedEdit = alertPublishFailure('Comment edit failed.');
const alertFailedModeration = alertPublishFailure('Comment moderation failed.');

const daysToTimestampInSeconds = (days: number) => {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return Math.floor(now.getTime() / 1000);
};

const timestampToDays = (timestamp: number) => {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(1, Math.floor((timestamp - now) / (24 * 60 * 60)));
};

interface EditMenuUiState {
  isEditMenuOpen: boolean;
  isContentEditorOpen: boolean;
}

type EditMenuUiAction = { type: 'set-edit-menu-open'; open: boolean } | { type: 'toggle-content-editor' } | { type: 'close-content-editor' };

const initialEditMenuUiState: EditMenuUiState = {
  isEditMenuOpen: false,
  isContentEditorOpen: false,
};

const editMenuUiReducer = (state: EditMenuUiState, action: EditMenuUiAction): EditMenuUiState => {
  switch (action.type) {
    case 'set-edit-menu-open':
      return { ...state, isEditMenuOpen: action.open };
    case 'toggle-content-editor':
      return { ...state, isContentEditorOpen: !state.isContentEditorOpen };
    case 'close-content-editor':
      return { ...state, isContentEditorOpen: false };
  }
};

const EditMenu = ({ post }: { post: Comment }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const resolvedPost = withResolvedCommentCommunityAddress(post);
  const { author, cid, content, deleted, locked, parentCid, pinned, postCid, reason, removed, spoiler } = resolvedPost || {};
  const communityAddress = getCommentCommunityAddress(resolvedPost);
  const archived = isCommentArchived(resolvedPost);
  const authorDisplayName = resolvedPost?.author?.displayName;
  // A moderation carrying author.banExpiresAt labels the comment it is published on, so the ban is pre-filled from
  // this comment's own ban (the account's pending moderation, then the published authorBanExpiresAt), never from the
  // author-wide author.community.banExpiresAt, and only while it is still running.
  const thisPostBanExpiresAt = resolvedPost?.commentModeration?.author?.banExpiresAt ?? resolvedPost?.authorBanExpiresAt;
  const modBanExpiresAt = typeof thisPostBanExpiresAt === 'number' && thisPostBanExpiresAt > Math.floor(Date.now() / 1000) ? thisPostBanExpiresAt : undefined;
  const purged = resolvedPost?.commentModeration?.purged ?? false;
  const [uiState, dispatchUiState] = useReducer(editMenuUiReducer, initialEditMenuUiState);
  const { isEditMenuOpen, isContentEditorOpen } = uiState;

  const account = useAccount();
  const { isCommentAuthorMod, isAccountMod, isAccountCommentAuthor } = useAuthorPrivileges({
    commentAuthorAddress: author?.address,
    communityAddress: communityAddress || '',
    postCid,
  });
  const pseudonymityMode = useBoardPseudonymityMode(communityAddress);
  // A board without an archive rejects newly archived threads, but a thread archived earlier can still be unarchived
  const canToggleArchived = useBoardHasArchive(communityAddress) || archived;
  const allowsPseudonymousDelete = pseudonymityMode !== undefined && pseudonymityMode !== 'none';
  const canAttemptAuthorDelete = isAccountCommentAuthor || allowsPseudonymousDelete;
  const canOpenEditMenu = isAccountMod || canAttemptAuthorDelete;
  const canEditOwnModPost = isAccountMod && isAccountCommentAuthor;
  // The transfer and its modal live in a shared store, so this Trash and the mod queue's share one lock, and the
  // modal keeps showing the result after the post shows as removed.
  const { openTransfer: openPostTransfer } = usePostTransfer(resolvedPost);
  const canTransferPost = isAccountMod && openPostTransfer !== undefined;
  const signer = isAccountCommentAuthor ? account?.signer : undefined;
  const latestPostRef = useRef(resolvedPost);
  useEffect(() => {
    latestPostRef.current = resolvedPost;
  }, [resolvedPost]);
  const onEditChallenge = useCallback((...args: any) => useChallengesStore.getState().addChallenge([...args, latestPostRef.current], undefined, alertFailedEdit), []);
  const onModerationChallenge = useCallback(
    (...args: any) => useChallengesStore.getState().addChallenge([...args, latestPostRef.current], undefined, alertFailedModeration),
    [],
  );

  const defaultPublishEditOptions = useMemo(() => {
    return {
      commentCid: cid,
      communityAddress,
      // Author edit properties
      content: canEditOwnModPost ? content : undefined,
      deleted: canAttemptAuthorDelete ? (deleted ?? false) : undefined,
      // Mod edit properties
      commentModeration: isAccountMod
        ? {
            locked: locked ?? false,
            archived: parentCid === undefined ? (archived ?? false) : undefined,
            pinned: pinned ?? false,
            removed: removed ?? false,
            purged: purged ?? false,
            reason: reason ?? '',
            spoiler: spoiler ?? false,
            author: modBanExpiresAt ? { banExpiresAt: modBanExpiresAt } : undefined,
          }
        : undefined,
      onChallenge: onEditChallenge,
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: onFinalPublishError(alertFailedEdit),
    };
  }, [
    isAccountMod,
    canEditOwnModPost,
    canAttemptAuthorDelete,
    archived,
    cid,
    content,
    deleted,
    locked,
    pinned,
    reason,
    removed,
    parentCid,
    purged,
    spoiler,
    communityAddress,
    modBanExpiresAt,
    onEditChallenge,
  ]);

  const [publishCommentEditOptions, setPublishCommentEditOptions] = useState<PublishCommentEditOptions>(defaultPublishEditOptions);

  const authorEditOptions = useMemo<PublishCommentEditOptions>(() => {
    const options: PublishCommentEditOptions = {
      commentCid: cid,
      communityAddress,
      content: canEditOwnModPost ? publishCommentEditOptions.content : undefined,
      deleted: publishCommentEditOptions.deleted,
      onChallenge: onEditChallenge,
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: onFinalPublishError(alertFailedEdit),
    };

    if (!isAccountCommentAuthor) {
      return options;
    }

    return {
      ...options,
      signer,
      author: signer?.address === author?.address ? { address: signer?.address, displayName: authorDisplayName } : account?.author,
    };
  }, [
    publishCommentEditOptions,
    cid,
    communityAddress,
    canEditOwnModPost,
    isAccountCommentAuthor,
    signer,
    account?.author,
    author?.address,
    authorDisplayName,
    onEditChallenge,
  ]);

  // The ban the menu opened with, so a ban that runs out or another mod changes while the menu is open is not resent
  const [openedBanExpiresAt, setOpenedBanExpiresAt] = useState(modBanExpiresAt);
  const draftBanExpiresAt = publishCommentEditOptions.commentModeration?.author?.banExpiresAt;
  // A ban is sent only when the mod sets, changes or lifts it in this menu, so removing or locking a banned post does
  // not republish it. Lifting publishes the current time, as pkc-js unbans: the ban ends and the post keeps its label.
  const banExpiresAtToPublish =
    draftBanExpiresAt !== undefined
      ? draftBanExpiresAt !== openedBanExpiresAt
        ? draftBanExpiresAt
        : undefined
      : openedBanExpiresAt !== undefined
        ? Math.floor(Date.now() / 1000)
        : undefined;

  const modEditOptions = useMemo<PublishCommentModerationOptions>(
    () => ({
      commentCid: cid,
      communityAddress,
      commentModeration: {
        locked: parentCid === undefined ? publishCommentEditOptions.commentModeration?.locked : undefined,
        archived: parentCid === undefined ? publishCommentEditOptions.commentModeration?.archived : undefined,
        pinned: publishCommentEditOptions.commentModeration?.pinned,
        removed: publishCommentEditOptions.commentModeration?.removed,
        purged: publishCommentEditOptions.commentModeration?.purged,
        reason: publishCommentEditOptions.commentModeration?.reason,
        spoiler: publishCommentEditOptions.commentModeration?.spoiler,
        // bitsocial-react-hooks reads an author key, even undefined, as a change to the ban, so it is left out entirely
        ...(banExpiresAtToPublish !== undefined && { author: { banExpiresAt: banExpiresAtToPublish } }),
      },
      author: account?.author,
      onChallenge: onModerationChallenge,
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: onFinalPublishError(alertFailedModeration),
    }),
    [publishCommentEditOptions, cid, communityAddress, account?.author, parentCid, onModerationChallenge, banExpiresAtToPublish],
  );

  const { publishCommentEdit: publishAuthorEdit } = usePublishCommentEdit(authorEditOptions);
  const { publishCommentModeration } = usePublishCommentModeration(modEditOptions);

  const [banDuration, setBanDuration] = useState(() =>
    defaultPublishEditOptions.commentModeration?.author?.banExpiresAt ? timestampToDays(defaultPublishEditOptions.commentModeration.author.banExpiresAt) : 1,
  );

  const resetMenuState = () => {
    setPublishCommentEditOptions(defaultPublishEditOptions);
    setOpenedBanExpiresAt(defaultPublishEditOptions.commentModeration?.author?.banExpiresAt);
    setBanDuration(
      defaultPublishEditOptions.commentModeration?.author?.banExpiresAt ? timestampToDays(defaultPublishEditOptions.commentModeration.author.banExpiresAt) : 1,
    );
    dispatchUiState({ type: 'close-content-editor' });
  };

  const onCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, checked } = e.target;

    setPublishCommentEditOptions((state) => {
      const newState = { ...state };

      if (isAccountMod) {
        if (id === 'banUser') {
          const banValue = checked ? daysToTimestampInSeconds(banDuration) : undefined;
          newState.commentModeration = {
            ...newState.commentModeration,
            author: banValue ? { banExpiresAt: banValue } : undefined,
          };
        } else {
          newState.commentModeration = {
            ...newState.commentModeration,
            [id]: checked,
          };
        }
      }

      if (id === 'deleted' && canAttemptAuthorDelete) {
        newState.deleted = checked;
      }

      return newState;
    });
  };

  const onBanDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const days = parseInt(e.target.value, 10) || 1;
    setBanDuration(days);
    setPublishCommentEditOptions((state) => {
      // Only update ban expiration if ban is currently enabled (checkbox is checked)
      const isBanEnabled = state.commentModeration?.author?.banExpiresAt !== undefined;
      return {
        ...state,
        commentModeration: {
          ...state.commentModeration,
          author: isBanEnabled ? { banExpiresAt: daysToTimestampInSeconds(days) } : state.commentModeration?.author,
        },
      };
    });
  };

  const onPurgeCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target;

    if (checked) {
      const confirmed = window.confirm(t('purge_confirm'));
      if (!confirmed) {
        return;
      }
    }

    setPublishCommentEditOptions((state) => {
      const newState = { ...state };
      if (isAccountMod) {
        newState.commentModeration = {
          ...newState.commentModeration,
          purged: checked,
        };
      }
      return newState;
    });
  };

  const { refs, floatingStyles, context } = useFloating({
    placement: 'bottom-start',
    open: isEditMenuOpen,
    onOpenChange: (open) => dispatchUiState({ type: 'set-edit-menu-open', open }),
    middleware: [offset(2), shift()],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role]);

  const headingId = useId();
  const hasDeleteStateChanged = (deleted ?? false) !== (publishCommentEditOptions.deleted ?? false);
  const hasContentStateChanged = canEditOwnModPost && (content ?? '') !== (publishCommentEditOptions.content ?? '');

  const _publishCommentEdit = async () => {
    const shouldPublishAuthorEdit = (canAttemptAuthorDelete && hasDeleteStateChanged) || hasContentStateChanged;

    try {
      if (shouldPublishAuthorEdit && isAccountMod) {
        await publishAuthorEdit();
        await publishCommentModeration();
      } else if (shouldPublishAuthorEdit) {
        await publishAuthorEdit();
      } else if (isAccountMod) {
        await publishCommentModeration();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.warn(error);
        alert(error.message);
      }
    }
    dispatchUiState({ type: 'set-edit-menu-open', open: false });
  };

  const openTransfer = () => {
    dispatchUiState({ type: 'set-edit-menu-open', open: false });
    openPostTransfer?.();
  };

  return (
    <>
      <span className={`${styles.checkbox} ${parentCid && styles.replyCheckbox}`} ref={refs.setReference} {...(cid && getReferenceProps())}>
        <input
          type='checkbox'
          aria-label={t('edit')}
          onChange={() => {
            if (cid && canOpenEditMenu) {
              if (!isEditMenuOpen) {
                resetMenuState();
                dispatchUiState({ type: 'set-edit-menu-open', open: true });
              } else {
                dispatchUiState({ type: 'set-edit-menu-open', open: false });
              }
            } else {
              dispatchUiState({ type: 'set-edit-menu-open', open: false });
              alert(parentCid ? t('cannot_edit_reply') : t('cannot_edit_thread'));
            }
          }}
          checked={isEditMenuOpen}
        />
      </span>
      {isEditMenuOpen && canOpenEditMenu && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div className={styles.modal} ref={refs.setFloating} style={floatingStyles} aria-labelledby={headingId} {...getFloatingProps()}>
              <div className={styles.editMenu}>
                {canAttemptAuthorDelete && (
                  <>
                    <div className={styles.menuItem}>
                      <label>
                        [
                        <input
                          aria-label={capitalize(t('delete'))}
                          onChange={onCheckbox}
                          checked={publishCommentEditOptions.deleted ?? false}
                          type='checkbox'
                          id='deleted'
                        />
                        {capitalize(t('delete'))}?]
                      </label>
                    </div>
                  </>
                )}
                {isAccountMod && (
                  <>
                    {canEditOwnModPost && (
                      <>
                        <div className={styles.menuItem}>
                          <label>
                            [
                            <input
                              aria-label={capitalize(t('edit'))}
                              type='checkbox'
                              onChange={() => dispatchUiState({ type: 'toggle-content-editor' })}
                              checked={isContentEditorOpen}
                            />
                            {capitalize(t('edit'))}?]
                          </label>
                        </div>
                        {isContentEditorOpen && (
                          <div>
                            <textarea
                              className={styles.editTextarea}
                              aria-label={capitalize(t('edit'))}
                              value={publishCommentEditOptions.content || ''}
                              onChange={(e) => {
                                const newContent = e.target.value;
                                setPublishCommentEditOptions((state) => ({ ...state, content: newContent }));
                              }}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <div className={styles.menuItem}>
                      <label>
                        [
                        <input
                          aria-label={capitalize(t('remove'))}
                          onChange={onCheckbox}
                          checked={publishCommentEditOptions.commentModeration?.removed ?? false}
                          type='checkbox'
                          id='removed'
                        />
                        {capitalize(t('remove'))}?]
                      </label>{' '}
                      <span className={styles.purgeItem}>
                        <label>
                          [
                          <input
                            aria-label={capitalize(t('purge'))}
                            onChange={onPurgeCheckbox}
                            checked={publishCommentEditOptions.commentModeration?.purged ?? false}
                            type='checkbox'
                            id='purged'
                          />
                          {capitalize(t('purge'))}?]
                        </label>
                      </span>
                    </div>
                    {!parentCid && (
                      <div className={styles.menuItem}>
                        [
                        <label>
                          <input
                            aria-label={capitalize(t('close_thread'))}
                            onChange={onCheckbox}
                            checked={publishCommentEditOptions.commentModeration?.locked ?? false}
                            type='checkbox'
                            id='locked'
                          />
                          {capitalize(t('close_thread'))}?
                        </label>
                        ]
                      </div>
                    )}
                    <div className={styles.menuItem}>
                      [
                      <label>
                        <input
                          aria-label={capitalize(t('spoiler'))}
                          onChange={onCheckbox}
                          checked={publishCommentEditOptions.commentModeration?.spoiler ?? false}
                          type='checkbox'
                          id='spoiler'
                        />
                        {capitalize(t('spoiler'))}?
                      </label>
                      ]
                    </div>
                    {!parentCid && canToggleArchived && (
                      <div className={styles.menuItem}>
                        [
                        <label>
                          <input
                            aria-label={capitalize(t('archived'))}
                            onChange={onCheckbox}
                            checked={publishCommentEditOptions.commentModeration?.archived ?? false}
                            type='checkbox'
                            id='archived'
                          />
                          {capitalize(t('archived'))}?
                        </label>
                        ]
                      </div>
                    )}
                    <div className={styles.menuItem}>
                      [
                      <label>
                        <input
                          aria-label={capitalize(t('sticky'))}
                          onChange={onCheckbox}
                          checked={publishCommentEditOptions.commentModeration?.pinned ?? false}
                          type='checkbox'
                          id='pinned'
                        />
                        {capitalize(t('sticky'))}?
                      </label>
                      ]
                    </div>
                    {!isCommentAuthorMod && isAccountMod && !isAccountCommentAuthor && (
                      <div className={styles.menuItem}>
                        [
                        <label>
                          <input
                            onChange={onCheckbox}
                            aria-label={capitalize(t('ban'))}
                            checked={publishCommentEditOptions.commentModeration?.author?.banExpiresAt !== undefined}
                            type='checkbox'
                            id='banUser'
                          />
                          <Trans
                            i18nKey='ban_user_for'
                            shouldUnescape={true}
                            components={{
                              1: (
                                <input
                                  key='ban-duration-input'
                                  className={styles.banInput}
                                  aria-label={t('ban_duration_days')}
                                  onChange={onBanDurationChange}
                                  type='number'
                                  min={1}
                                  max={100}
                                  value={banDuration || ''}
                                />
                              ),
                            }}
                          />
                          ?
                        </label>
                        ]
                      </div>
                    )}
                    <div className={`${styles.menuItem} ${styles.menuReason}`}>
                      <label>
                        {capitalize(t('reason'))}? ({t('optional')})
                        <input
                          type='text'
                          aria-label={capitalize(t('reason'))}
                          value={publishCommentEditOptions.commentModeration?.reason || ''}
                          onChange={(e) => {
                            const newReason = e.target.value;
                            setPublishCommentEditOptions((state) => ({
                              ...state,
                              commentModeration: {
                                ...state.commentModeration,
                                reason: newReason,
                              },
                            }));
                          }}
                          size={14}
                        />
                      </label>
                    </div>
                    {canTransferPost && (
                      <div className={styles.menuItem}>
                        [
                        <button type='button' className={styles.menuButton} onClick={openTransfer}>
                          {t('trash')}
                        </button>
                        ?]
                      </div>
                    )}
                  </>
                )}
                <div className={styles.bottom}>
                  <button type='button' className={isMobile ? 'button' : ''} onClick={_publishCommentEdit}>
                    {t('save')}
                  </button>
                </div>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
};

export default EditMenu;
