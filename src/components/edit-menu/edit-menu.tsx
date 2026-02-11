import { useEffect, useState, useMemo, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { autoUpdate, FloatingFocusManager, offset, shift, useClick, useDismiss, useFloating, useId, useInteractions, useRole } from '@floating-ui/react';
import {
  Comment,
  PublishCommentEditOptions,
  useAccount,
  usePublishCommentEdit,
  usePublishCommentModeration,
  PublishCommentModerationOptions,
} from '@plebbit/plebbit-react-hooks';
import styles from './edit-menu.module.css';
import { alertChallengeVerificationFailed } from '../../lib/utils/challenge-utils';
import useChallengesStore from '../../stores/use-challenges-store';
import { capitalize } from 'lodash';
import useIsMobile from '../../hooks/use-is-mobile';
import useAuthorPrivileges from '../../hooks/use-author-privileges';

const { addChallenge } = useChallengesStore.getState();

const daysToTimestampInSeconds = (days: number) => {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return Math.floor(now.getTime() / 1000);
};

const timestampToDays = (timestamp: number) => {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(1, Math.floor((timestamp - now) / (24 * 60 * 60)));
};

const EditMenu = ({ post }: { post: Comment }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { author, cid, content, deleted, locked, parentCid, pinned, postCid, reason, removed, spoiler, subplebbitAddress } = post || {};
  const purged = post?.commentModeration?.purged ?? false;
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [isContentEditorOpen, setIsContentEditorOpen] = useState(false);

  const account = useAccount();
  const [signer, setSigner] = useState<any>(account?.signer);

  const { isCommentAuthorMod, isAccountMod, isAccountCommentAuthor } = useAuthorPrivileges({
    commentAuthorAddress: author?.address,
    subplebbitAddress,
    postCid,
  });

  const checkSigner = useCallback(() => {
    if (isAccountCommentAuthor) {
      setSigner(account?.signer);
    } else {
      setSigner(null);
    }
  }, [isAccountCommentAuthor, account?.signer]);

  useEffect(() => {
    checkSigner();
  }, [checkSigner]);

  const defaultPublishEditOptions = useMemo(() => {
    return {
      commentCid: cid,
      subplebbitAddress,
      // Author edit properties
      content: isAccountCommentAuthor ? content : undefined,
      deleted: isAccountCommentAuthor ? (deleted ?? false) : undefined,
      spoiler: isAccountCommentAuthor ? (spoiler ?? false) : undefined,
      // Mod edit properties
      commentModeration: isAccountMod
        ? {
            locked: locked ?? false,
            pinned: pinned ?? false,
            removed: removed ?? false,
            purged: purged ?? false,
            spoiler: spoiler ?? false,
            reason,
            author: post?.commentModeration?.author?.banExpiresAt ? { banExpiresAt: post.commentModeration.author.banExpiresAt } : undefined,
          }
        : undefined,
      onChallenge: (...args: any) => addChallenge([...args, post]),
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: (error: Error) => {
        console.warn(error);
        alert('Comment edit failed. ' + error.message);
      },
    };
  }, [isAccountMod, isAccountCommentAuthor, cid, content, deleted, locked, pinned, reason, removed, purged, spoiler, subplebbitAddress, post]);

  const [publishCommentEditOptions, setPublishCommentEditOptions] = useState<PublishCommentEditOptions>(defaultPublishEditOptions);

  const authorEditOptions = useMemo<PublishCommentEditOptions>(
    () => ({
      commentCid: cid,
      subplebbitAddress,
      signer,
      author: signer?.address === author?.address ? { address: signer?.address, displayName: post?.author?.displayName } : account?.author,
      content: publishCommentEditOptions.content,
      deleted: publishCommentEditOptions.deleted,
      reason: publishCommentEditOptions.reason,
      spoiler: publishCommentEditOptions.spoiler,
      onChallenge: (...args: any) => addChallenge([...args, post]),
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: (error: Error) => {
        console.warn(error);
        alert('Comment edit failed. ' + error.message);
      },
    }),
    [publishCommentEditOptions, cid, subplebbitAddress, signer, post, account?.author, author?.address],
  );

  const modEditOptions = useMemo<PublishCommentModerationOptions>(
    () => ({
      commentCid: cid,
      subplebbitAddress,
      commentModeration: {
        locked: parentCid === undefined ? publishCommentEditOptions.commentModeration?.locked : undefined,
        pinned: publishCommentEditOptions.commentModeration?.pinned,
        removed: publishCommentEditOptions.commentModeration?.removed,
        purged: publishCommentEditOptions.commentModeration?.purged,
        spoiler: publishCommentEditOptions.commentModeration?.spoiler,
        reason: publishCommentEditOptions.reason,
        author: publishCommentEditOptions.commentModeration?.author,
      },
      author: account?.author,
      onChallenge: (...args: any) => addChallenge([...args, post]),
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: (error: Error) => {
        console.warn(error);
        alert('Comment moderation failed. ' + error.message);
      },
    }),
    [publishCommentEditOptions, cid, subplebbitAddress, post, account?.author, parentCid],
  );

  const { publishCommentEdit: publishAuthorEdit } = usePublishCommentEdit(authorEditOptions);
  const { publishCommentModeration } = usePublishCommentModeration(modEditOptions);

  useEffect(() => {
    setPublishCommentEditOptions(defaultPublishEditOptions);
  }, [defaultPublishEditOptions]);

  const [banDuration, setBanDuration] = useState(() =>
    publishCommentEditOptions.commentModeration?.author?.banExpiresAt ? timestampToDays(publishCommentEditOptions.commentModeration.author.banExpiresAt) : 1,
  );

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

      if (isAccountCommentAuthor) {
        newState[id] = checked;
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

    // Double confirmation for purge action
    if (checked) {
      const firstConfirm = window.confirm(t('purge_confirm'));
      if (!firstConfirm) {
        return;
      }
      const secondConfirm = window.confirm(t('double_confirm'));
      if (!secondConfirm) {
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
    onOpenChange: setIsEditMenuOpen,
    middleware: [offset(2), shift()],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const headingId = useId();

  const _publishCommentEdit = async () => {
    try {
      if (isAccountCommentAuthor && isAccountMod) {
        await publishAuthorEdit();
        await publishCommentModeration();
      } else if (isAccountCommentAuthor) {
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
    setIsEditMenuOpen(false);
  };

  return (
    <>
      <span className={`${styles.checkbox} ${parentCid && styles.replyCheckbox}`} ref={refs.setReference} {...(cid && getReferenceProps())}>
        <input
          type='checkbox'
          onChange={() => {
            if (cid && (isAccountCommentAuthor || isAccountMod)) {
              setIsEditMenuOpen(!isEditMenuOpen);
            } else {
              setIsEditMenuOpen(false);
              alert(parentCid ? t('cannot_edit_reply') : t('cannot_edit_thread'));
            }
          }}
          checked={isEditMenuOpen}
        />
      </span>
      {isEditMenuOpen && (isAccountCommentAuthor || isAccountMod) && (
        <FloatingFocusManager context={context} modal={false}>
          <div className={styles.modal} ref={refs.setFloating} style={floatingStyles} aria-labelledby={headingId} {...getFloatingProps()}>
            <div className={styles.editMenu}>
              {isAccountCommentAuthor && (
                <>
                  <div className={styles.menuItem}>
                    <label>
                      [
                      <input onChange={onCheckbox} checked={publishCommentEditOptions.deleted ?? false} type='checkbox' id='deleted' />
                      {capitalize(t('delete'))}?]
                    </label>
                  </div>
                  <div className={styles.menuItem}>
                    <label>
                      [
                      <input type='checkbox' onChange={() => setIsContentEditorOpen(!isContentEditorOpen)} checked={isContentEditorOpen} />
                      {capitalize(t('edit'))}?]
                    </label>
                  </div>
                  {isContentEditorOpen && (
                    <div>
                      <textarea
                        className={styles.editTextarea}
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
              {isAccountMod && (
                <>
                  <div className={styles.menuItem}>
                    <label>
                      [
                      <input onChange={onCheckbox} checked={publishCommentEditOptions.commentModeration?.removed ?? false} type='checkbox' id='removed' />
                      {capitalize(t('remove'))}?]
                    </label>{' '}
                    <span className={styles.purgeItem}>
                      <label>
                        [
                        <input onChange={onPurgeCheckbox} checked={publishCommentEditOptions.commentModeration?.purged ?? false} type='checkbox' id='purged' />
                        {capitalize(t('purge'))}?]
                      </label>
                    </span>
                  </div>
                  {!parentCid && (
                    <div className={styles.menuItem}>
                      [
                      <label>
                        <input onChange={onCheckbox} checked={publishCommentEditOptions.commentModeration?.locked ?? false} type='checkbox' id='locked' />
                        {capitalize(t('close_thread'))}?
                      </label>
                      ]
                    </div>
                  )}
                  <div className={styles.menuItem}>
                    [
                    <label>
                      <input onChange={onCheckbox} checked={publishCommentEditOptions.commentModeration?.spoiler ?? false} type='checkbox' id='spoiler' />
                      {capitalize(t('spoiler'))}?
                    </label>
                    ]
                  </div>
                  <div className={styles.menuItem}>
                    [
                    <label>
                      <input onChange={onCheckbox} checked={publishCommentEditOptions.commentModeration?.pinned ?? false} type='checkbox' id='pinned' />
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
                </>
              )}
              <div className={`${styles.menuItem} ${styles.menuReason}`}>
                {capitalize(t('reason'))}? ({t('optional')})
                <input
                  type='text'
                  value={publishCommentEditOptions.reason || ''}
                  onChange={(e) => {
                    const newReason = e.target.value;
                    setPublishCommentEditOptions((state) => ({ ...state, reason: newReason }));
                  }}
                  size={14}
                />
              </div>
              <div className={styles.bottom}>
                <button className={isMobile ? 'button' : ''} onClick={_publishCommentEdit}>
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
};

export default EditMenu;
