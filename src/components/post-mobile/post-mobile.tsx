import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { Virtuoso, VirtuosoHandle, StateSnapshot } from 'react-virtuoso';
import { Comment, useEditedComment, useReplies, useAccount, usePublishCommentModeration, useAccountComment } from '@plebbit/plebbit-react-hooks';
import Plebbit from '@plebbit/plebbit-js';
import styles from '../../views/post/post.module.css';
import { shouldShowSnow } from '../../lib/snow';
import { getHasThumbnail } from '../../lib/utils/media-utils';
import { getTextColorForBackground, hashStringToColor } from '../../lib/utils/post-utils';
import { getFormattedDate, getFormattedTimeAgo } from '../../lib/utils/time-utils';
import { isAllView, isModQueueView, isPendingPostView, isPostPageView, isSubscriptionsView } from '../../lib/utils/view-utils';
import { formatUserIDForDisplay } from '../../lib/utils/string-utils';
import useModQueueStore from '../../stores/use-mod-queue-store';
import { useDirectories } from '../../hooks/use-directories';
import { getBoardPath } from '../../lib/utils/route-utils';
import useAuthorAddressClick from '../../hooks/use-author-address-click';
import { useCommentMediaInfo } from '../../hooks/use-comment-media-info';
import useCountLinksInReplies from '../../hooks/use-count-links-in-replies';
import useHide from '../../hooks/use-hide';
import useStateString from '../../hooks/use-state-string';
import useScrollToReply from '../../hooks/use-scroll-to-reply';
import { useCurrentTime } from '../../hooks/use-current-time';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import CommentContent from '../comment-content';
import CommentMedia from '../comment-media';
import LoadingEllipsis from '../loading-ellipsis';
import PostMenuMobile from './post-menu-mobile';
import ReplyQuotePreview from '../reply-quote-preview';
import Tooltip from '../tooltip';
import { PostProps } from '../../views/post/post';
import capitalize from 'lodash/capitalize';
import lowerCase from 'lodash/lowerCase';
import useReplyModalStore from '../../stores/use-reply-modal-store';
import { selectPostMenuProps } from '../../lib/utils/post-menu-props';
import useChallengesStore from '../../stores/use-challenges-store';
import useFeedResetStore from '../../stores/use-feed-reset-store';
import usePostNumberStore from '../../stores/use-post-number-store';
import { alertChallengeVerificationFailed } from '../../lib/utils/challenge-utils';
import useQuotedByMap from '../../hooks/use-quoted-by-map';
import useProgressiveRender from '../../hooks/use-progressive-render';
import { REPLIES_PER_PAGE } from '../../lib/constants';

const { addChallenge } = useChallengesStore.getState();

const RepliesFooter = ({ hasMore, loadingString }: { hasMore: boolean; loadingString: string }) =>
  hasMore ? (
    <div className={styles.stateString}>
      <LoadingEllipsis string={loadingString} />
    </div>
  ) : null;

// Store scroll position for replies virtuoso across navigations
const lastVirtuosoStates: { [key: string]: StateSnapshot } = {};

const PostInfoAndMedia = ({ post, postReplyCount = 0, roles, threadNumber }: PostProps) => {
  const { t } = useTranslation();
  const directories = useDirectories();
  const { author, cid, deleted, link, linkHeight, linkWidth, locked, parentCid, pinned, postCid, reason, removed, state, subplebbitAddress, timestamp, thumbnailUrl } =
    post || {};
  const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : undefined;
  const isReply = parentCid;
  const title = post?.title?.trim();
  const { address, shortAddress } = author || {};
  const displayName = author?.displayName?.trim();
  const authorRole = roles?.[address]?.role?.replace('moderator', 'mod');

  const params = useParams();
  const location = useLocation();
  const isInAllView = isAllView(location.pathname);
  const isInPostPageView = isPostPageView(location.pathname, params);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
  const isInModQueueView = isModQueueView(location.pathname);
  const { getAlertThresholdSeconds } = useModQueueStore();
  const currentTime = useCurrentTime();
  const account = useAccount();
  const accountAddress = account?.author?.address;

  // Check if user is mod of this board
  const accountRole = roles?.[accountAddress]?.role;
  const isAccountMod = accountRole === 'admin' || accountRole === 'owner' || accountRole === 'moderator';

  // Check if post is pending approval and user is mod (for post page view)
  const pendingApproval = post?.pendingApproval;
  const shouldShowPendingApprovalButtons = isInPostPageView && !isInModQueueView && pendingApproval && isAccountMod && subplebbitAddress;

  // Moderation actions for pending approval posts
  const {
    publishCommentModeration: approvePending,
    state: approvePendingState,
    error: approvePendingError,
  } = usePublishCommentModeration({
    commentCid: cid,
    subplebbitAddress: shouldShowPendingApprovalButtons ? subplebbitAddress : undefined,
    commentModeration: { approved: true },
    onChallenge: async (...args: any) => {
      addChallenge([...args, post]);
    },
    onChallengeVerification: async (challengeVerification, comment) => {
      alertChallengeVerificationFailed(challengeVerification, comment);
    },
    onError: (error: Error) => {
      console.error('Approve failed:', error);
    },
  });

  const {
    publishCommentModeration: rejectPending,
    state: rejectPendingState,
    error: rejectPendingError,
  } = usePublishCommentModeration({
    commentCid: cid,
    subplebbitAddress: shouldShowPendingApprovalButtons ? subplebbitAddress : undefined,
    commentModeration: { removed: true },
    onChallenge: async (...args: any) => {
      addChallenge([...args, post]);
    },
    onChallengeVerification: async (challengeVerification, comment) => {
      alertChallengeVerificationFailed(challengeVerification, comment);
    },
    onError: (error: Error) => {
      console.error('Reject failed:', error);
    },
  });

  const [initiatedPendingAction, setInitiatedPendingAction] = useState<'approve' | 'reject' | null>(null);

  const handlePendingApprove = useCallback(async () => {
    const confirm = window.confirm(t('double_confirm'));
    if (!confirm) {
      return;
    }
    setInitiatedPendingAction('approve');
    try {
      await approvePending();
    } catch (e) {
      console.error(e);
    }
  }, [approvePending, t]);

  const handlePendingReject = useCallback(async () => {
    const confirm = window.confirm(t('double_confirm'));
    if (!confirm) {
      return;
    }
    setInitiatedPendingAction('reject');
    try {
      await rejectPending();
    } catch (e) {
      console.error(e);
    }
  }, [rejectPending, t]);

  const isApprovingPending =
    initiatedPendingAction === 'approve' && approvePendingState !== 'initializing' && approvePendingState !== 'succeeded' && approvePendingState !== 'failed';
  const isRejectingPending =
    initiatedPendingAction === 'reject' && rejectPendingState !== 'initializing' && rejectPendingState !== 'succeeded' && rejectPendingState !== 'failed';
  const isPublishingPending = isApprovingPending || isRejectingPending;

  const approvePendingSucceeded = initiatedPendingAction === 'approve' && approvePendingState === 'succeeded';
  const rejectPendingSucceeded = initiatedPendingAction === 'reject' && rejectPendingState === 'succeeded';
  const approvePendingFailed = initiatedPendingAction === 'approve' && approvePendingState === 'failed';
  const rejectPendingFailed = initiatedPendingAction === 'reject' && rejectPendingState === 'failed';

  const pendingStatus = approvePendingSucceeded ? 'approved' : rejectPendingSucceeded ? 'rejected' : approvePendingFailed || rejectPendingFailed ? 'failed' : null;
  const pendingErrorMessage = approvePendingFailed ? approvePendingError?.message : rejectPendingFailed ? rejectPendingError?.message : undefined;

  const commentMediaInfo = useCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);

  // Check if post is awaiting approval and over threshold (for mod queue view)
  const approved = post?.approved;
  const alreadyApproved = approved === true;
  const alreadyRejected = removed === true;
  const isAwaitingApproval = isInModQueueView && !alreadyApproved && !alreadyRejected;
  const timeWaiting = timestamp ? currentTime - timestamp : 0;
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const isOverThreshold = isAwaitingApproval && timeWaiting > alertThresholdSeconds;

  const hasFailedState = state === 'failed';
  const postMenuProps = useMemo(() => selectPostMenuProps(post), [post]);

  const pseudonymityMode = useSubplebbitField(subplebbitAddress, (sub) => sub?.features?.pseudonymityMode);
  const showUserID = pseudonymityMode !== 'per-reply';

  const handleUserAddressClick = useAuthorAddressClick();
  const numberOfPostsByAuthor = useMemo(() => {
    if (!showUserID || deleted || removed || !shortAddress || !postCid || typeof document === 'undefined') {
      return 0;
    }

    return document.querySelectorAll(`[data-author-address="${shortAddress}"][data-post-cid="${postCid}"]`).length;
  }, [showUserID, deleted, removed, shortAddress, postCid, postReplyCount]);

  const userID = address && Plebbit.getShortAddress({ address }); // shortened to 8 chars for display; users can verify the full user ID via "Copy user ID" in the post menu to guard against spoofing
  const userIDBackgroundColor = hashStringToColor(userID);
  const userIDTextColor = getTextColorForBackground(userIDBackgroundColor);

  const { hidden } = useHide(post);

  const { openReplyModal } = useReplyModalStore();

  const onReplyModalClick = () => {
    deleted
      ? isReply
        ? alert(t('this_reply_was_deleted'))
        : alert(t('this_thread_was_deleted'))
      : removed
        ? isReply
          ? alert(t('this_reply_was_removed'))
          : alert(t('this_thread_was_removed'))
        : openReplyModal && openReplyModal(cid, post?.number, postCid, threadNumber, subplebbitAddress);
  };

  return (
    <>
      <div className={styles.postInfo}>
        <PostMenuMobile postMenu={postMenuProps} editMenuPost={post} />
        <span className={(hidden || ((removed || deleted) && !reason)) && parentCid ? styles.postDesktopHidden : ''}>
          <span className={styles.nameBlock}>
            <span className={`${styles.name} ${authorRole && !(deleted || removed) && (authorRole === 'mod' ? styles.capcodeMod : styles.capcodeAdmin)}`}>
              {removed ? (
                capitalize(t('removed'))
              ) : deleted ? (
                capitalize(t('deleted'))
              ) : displayName ? (
                displayName.length <= 20 ? (
                  displayName
                ) : (
                  <Tooltip
                    children={displayName.slice(0, 20) + '(...)'}
                    content={displayName.length < 1000 ? displayName : displayName.slice(0, 1000) + `... ${t('display_name_too_long')}`}
                  />
                )
              ) : (
                capitalize(t('anonymous'))
              )}{' '}
              {!(deleted || removed) && authorRole && (
                <span className='capitalize'>
                  {' '}
                  ## Board {authorRole}{' '}
                  <span className={styles.capcodeIconMobileWrapper}>
                    <span
                      className={`${styles.capcodeIconMobile} ${authorRole === 'mod' ? styles.capcodeModIcon : styles.capcodeAdminIcon}`}
                      title={authorRole === 'mod' ? t('moderator_of_this_board') : t('administrator_of_this_board')}
                    />
                  </span>
                  &nbsp;
                </span>
              )}
            </span>
            {showUserID && (
              <>
                (ID: {''}
                {removed ? (
                  lowerCase(t('removed'))
                ) : deleted ? (
                  lowerCase(t('deleted'))
                ) : !cid && pseudonymityMode ? (
                  <span className={styles.pendingCid}>{hasFailedState ? capitalize(t('failed')) : capitalize(t('pending'))}</span>
                ) : (
                  <Tooltip
                    children={
                      <span
                        title={t('highlight_posts')}
                        className={styles.userAddress}
                        onClick={() => handleUserAddressClick(userID, postCid)}
                        style={{ backgroundColor: userIDBackgroundColor, color: userIDTextColor }}
                      >
                        {formatUserIDForDisplay(userID)}
                      </span>
                    }
                    content={`${numberOfPostsByAuthor === 1 ? t('1_post_by_this_id') : t('x_posts_by_this_id', { number: numberOfPostsByAuthor })}`}
                    showTooltip={isInPostPageView || postReplyCount < 6}
                  />
                )}
                ){' '}
              </>
            )}
            {pinned && (
              <span className={styles.stickyIconWrapper}>
                <img src='assets/icons/sticky.gif' alt='' className={styles.stickyIcon} title={t('sticky')} />
              </span>
            )}
            {locked && (
              <span className={`${styles.closedIconWrapper} ${pinned && styles.addPaddingInBetween}`}>
                <img src='assets/icons/closed.gif' alt='' className={styles.closedIcon} title={t('closed')} />
              </span>
            )}
            {title && (
              <span className={styles.subjectWrapper}>
                {title.length <= 30 ? (
                  <span className={styles.subject}>{title}</span>
                ) : (
                  <Tooltip
                    children={<span className={styles.subject}>{title.slice(0, 30) + '(...)'}</span>}
                    content={title.length < 1000 ? title : title.slice(0, 1000) + `... ${t('title_too_long')}`}
                  />
                )}
              </span>
            )}
          </span>
          <span className={styles.dateTimePostNum}>
            {subplebbitAddress && (isInAllView || isInSubscriptionsView) && !isReply && boardPath && (
              <div className={styles.postNumLink}>
                {' '}
                <Link to={`/${boardPath}`}>Board: {boardPath}</Link>
              </div>
            )}
            {isInModQueueView && isOverThreshold ? (
              <>
                <Tooltip children={<span>{getFormattedDate(timestamp)}</span>} content={getFormattedTimeAgo(timestamp)} /> (
                <span className={styles.alert}>{getFormattedTimeAgo(timestamp)}</span>)
              </>
            ) : (
              <Tooltip children={<span>{getFormattedDate(timestamp)}</span>} content={getFormattedTimeAgo(timestamp)} />
            )}{' '}
            {cid ? (
              <span className={styles.postNumLink}>
                <Link
                  to={boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`}
                  className={styles.linkToPost}
                  title={t('link_to_post')}
                  onClick={(e) => !cid && e.preventDefault()}
                >
                  No.
                </Link>
                <span className={styles.replyToPost} title={t('reply_to_post')} onMouseDown={onReplyModalClick}>
                  {post?.number || '?'}
                </span>
              </span>
            ) : (
              <>
                <span>No.</span>
                <span className={styles.pendingCid}>{hasFailedState ? capitalize(t('failed')) : capitalize(t('pending'))}</span>
              </>
            )}
            {shouldShowPendingApprovalButtons && (
              <div className={styles.modQueueActions}>
                {pendingStatus === 'approved' ? (
                  <span className={styles.modQueueStatusApproved}>{t('approved')}</span>
                ) : pendingStatus === 'rejected' ? (
                  <span className={styles.modQueueStatusRejected}>{t('rejected')}</span>
                ) : pendingStatus === 'failed' ? (
                  <span className={styles.modQueueStatusRejected}>
                    {t('failed')}
                    {pendingErrorMessage ? `: ${pendingErrorMessage}` : ''}
                  </span>
                ) : isPublishingPending ? (
                  <LoadingEllipsis string={t('publishing')} />
                ) : (
                  <>
                    <button className={`button ${styles.approveButton}`} onClick={handlePendingApprove} disabled={isPublishingPending}>
                      {t('approve')}
                    </button>
                    <button className={`button ${styles.rejectButton}`} onClick={handlePendingReject} disabled={isPublishingPending}>
                      {t('reject')}
                    </button>
                  </>
                )}
              </div>
            )}
          </span>
        </span>
      </div>
      {(hasThumbnail || link) && !(deleted || removed) && <PostMediaContent key={cid} post={post} link={link} />}
    </>
  );
};

const PostMediaContent = ({ post, link }: { post: any; link: string }) => {
  const [showThumbnail, setShowThumbnail] = useState(true);
  const { thumbnailUrl, linkWidth, linkHeight, spoiler, deleted, removed, parentCid } = post || {};
  const commentMediaInfo = useCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);

  return (
    hasThumbnail && (
      <CommentMedia
        commentMediaInfo={commentMediaInfo}
        deleted={deleted}
        removed={removed}
        linkHeight={linkHeight}
        linkWidth={linkWidth}
        showThumbnail={showThumbnail}
        setShowThumbnail={setShowThumbnail}
        parentCid={parentCid}
        spoiler={spoiler}
      />
    )
  );
};

const ReplyBacklinks = ({ post, quotedByMap }: PostProps) => {
  const { cid, parentCid } = post || {};
  const repliesResult = useReplies({
    comment: post,
    sortType: 'old',
    flat: true,
    accountComments: { newerThan: Infinity, append: true },
  });
  const { replies } = repliesResult;
  const updatedReplies = (repliesResult as { updatedReplies?: Comment[] }).updatedReplies;
  const repliesForRender = updatedReplies?.length ? updatedReplies : replies || [];

  const opBacklinks =
    cid &&
    !parentCid &&
    quotedByMap
      ?.get(cid)
      ?.map(
        (reply: Comment) =>
          reply?.cid && !(reply?.deleted || reply?.removed) && <ReplyQuotePreview key={`op-bl-${reply.cid}`} isBacklinkReply={true} backlinkReply={reply} />,
      )
      .filter(Boolean);

  const replyBacklinks = cid && parentCid && ((repliesForRender?.length || 0) > 0 || quotedByMap?.get(cid)?.length) && (
    <>
      {repliesForRender?.map(
        (reply: Comment, index: number) =>
          reply?.parentCid === cid && reply?.cid && !(reply?.deleted || reply?.removed) && <ReplyQuotePreview key={index} isBacklinkReply={true} backlinkReply={reply} />,
      )}
      {quotedByMap
        ?.get(cid)
        ?.map(
          (reply: Comment, index: number) =>
            reply?.parentCid !== cid &&
            reply?.cid &&
            !(reply?.deleted || reply?.removed) && <ReplyQuotePreview key={`qb-${index}`} isBacklinkReply={true} backlinkReply={reply} />,
        )}
    </>
  );

  return opBacklinks?.length > 0 || replyBacklinks ? (
    <div className={styles.mobileReplyBacklinks}>
      {opBacklinks}
      {replyBacklinks}
    </div>
  ) : null;
};

const Reply = ({ postReplyCount, reply, roles, threadNumber, quotedByMap }: PostProps) => {
  const accountReply = useAccountComment({
    commentIndex: typeof reply?.index === 'number' ? reply.index : undefined,
  });
  const hasReplyIndex = typeof reply?.index === 'number';
  let post = hasReplyIndex && accountReply?.index === reply.index ? accountReply : reply;
  // handle pending mod or author edit
  const { editedComment } = useEditedComment({ comment: post });
  if (editedComment) {
    post = editedComment;
  }
  const { author, cid, deleted, postCid, reason, removed, subplebbitAddress } = post || {};
  const directories = useDirectories();
  const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : undefined;
  const location = useLocation();
  const route = boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`;
  const isRouteLinkToReply = cid ? location.pathname.startsWith(route) : false;
  const { hidden } = useHide({ cid });

  return (
    <div className={styles.replyMobile}>
      <div className={styles.reply}>
        <div
          className={`${styles.replyContainer} ${isRouteLinkToReply && styles.highlight}`}
          data-cid={cid}
          data-author-address={author?.shortAddress}
          data-post-cid={postCid}
        >
          <PostInfoAndMedia post={post} postReplyCount={postReplyCount} roles={roles} threadNumber={threadNumber} />
          {!hidden && (!(removed || deleted) || ((removed || deleted) && reason)) && <CommentContent comment={post} />}
          <ReplyBacklinks post={post} quotedByMap={quotedByMap} />
        </div>
      </div>
    </div>
  );
};

const PostMobile = ({
  post,
  roles,
  showAllReplies,
  showReplies = true,
  targetReplyCid,
  isModQueue,
  modQueueStatus,
  modQueueError,
  isPublishing,
  onApprove,
  onReject,
}: PostProps) => {
  const { t } = useTranslation();
  const { author, cid, pinned, postCid, replyCount, state, subplebbitAddress } = post || {};
  const params = useParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const isInPendingPostView = isPendingPostView(location.pathname, params);
  const isInPostView = isPostPageView(location.pathname, params);
  const directories = useDirectories();
  const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : undefined;
  const linksCount = useCountLinksInReplies(post);
  const repliesResult = useReplies({
    comment: post,
    sortType: 'old',
    flat: true,
    repliesPerPage: REPLIES_PER_PAGE,
    accountComments: { newerThan: Infinity, append: true },
  });
  const { replies, hasMore, loadMore } = repliesResult;
  const updatedReplies = (repliesResult as { updatedReplies?: Comment[] }).updatedReplies;
  const repliesForRender = updatedReplies?.length ? updatedReplies : replies || [];
  const reset = (repliesResult as { reset?: () => Promise<void> }).reset;
  const setResetFunction = useFeedResetStore((s) => s.setResetFunction);
  useEffect(() => {
    if ((isInPostView || isInPendingPostView) && reset) {
      setResetFunction(() => {
        reset();
      });
    }
  }, [isInPostView, isInPendingPostView, reset, setResetFunction]);
  const registerComments = usePostNumberStore((s) => s.registerComments);
  const prevCidsRef = useRef<string>('');
  useEffect(() => {
    const all = post ? [post, ...repliesForRender] : repliesForRender;
    if (!all.length) return;
    const cidsKey = all
      .map((c) => c?.cid)
      .filter(Boolean)
      .sort()
      .join(',');
    if (cidsKey === prevCidsRef.current) return;
    prevCidsRef.current = cidsKey;
    registerComments(all);
  }, [post, repliesForRender, registerComments]);

  const isInPostPageView = isPostPageView(location.pathname, params);
  const { hidden, unhide } = useHide({ cid });

  const stateString = useStateString(post) || t('loading_post');
  const hasFailedState = state === 'failed';

  // Filter out deleted replies with no children for both virtuoso and non-virtuoso rendering
  const filteredReplies = useMemo(() => repliesForRender.filter((reply) => !(reply.deleted && (reply.replyCount === 0 || !reply.replyCount))), [repliesForRender]);

  const quotedByMap = useQuotedByMap(filteredReplies);

  const visibleReplies = useProgressiveRender(filteredReplies, {
    batchSize: 50,
    intervalMs: 100,
    resetKey: cid,
    disabled: hasMore || !!targetReplyCid || !showAllReplies,
  });

  // Virtuoso scroll position management for infinite replies
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const virtuosoStateKey = `replies-mobile-${cid}`;

  useEffect(() => {
    if (!showAllReplies || !isInPostPageView) return;

    const currentKey = virtuosoStateKey;
    const setLastVirtuosoState = () => {
      virtuosoRef.current?.getState((snapshot: StateSnapshot) => {
        if (snapshot?.ranges?.length) {
          lastVirtuosoStates[currentKey] = snapshot;
        }
      });
    };
    window.addEventListener('scroll', setLastVirtuosoState, { passive: true });
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [virtuosoStateKey, showAllReplies, isInPostPageView]);

  const lastVirtuosoState = navigationType === 'POP' ? lastVirtuosoStates?.[virtuosoStateKey] : undefined;

  const shouldScrollToReply = showAllReplies && showReplies && !isInPendingPostView && !!targetReplyCid;
  useScrollToReply({
    targetReplyCid,
    replies: filteredReplies,
    hasMore,
    loadMore,
    virtuosoRef,
    enabled: shouldScrollToReply,
  });

  const virtuosoFooter = useCallback(() => <RepliesFooter hasMore={hasMore} loadingString={t('loading')} />, [hasMore, t]);

  return (
    <>
      {hidden && !isInPostPageView ? (
        <>
          <hr className={styles.unhideButtonHr} />
          <span className={styles.mobileUnhideButton}>
            <span className='button' onClick={unhide}>
              Show Hidden Thread
            </span>
          </span>
        </>
      ) : (
        <div className={styles.postMobile}>
          {(showReplies || isModQueue) && (
            <div className={styles.hrWrapper}>
              <hr />
            </div>
          )}
          <div className={showReplies || isModQueue ? styles.thread : styles.quotePreview}>
            <div className={styles.postContainer}>
              <div
                className={`${styles.postOp} ${shouldShowSnow() ? styles.xmasHatWrapper : ''}`}
                data-cid={cid}
                data-author-address={author?.shortAddress}
                data-post-cid={postCid}
              >
                {shouldShowSnow() && <img src='assets/xmashat.gif' className={styles.xmasHat} alt='' />}
                <PostInfoAndMedia post={post} postReplyCount={replyCount} roles={roles} threadNumber={post?.number} />
                <CommentContent comment={post} />
                <ReplyBacklinks post={post} quotedByMap={quotedByMap} />
              </div>
              {!isInPostView && !isInPendingPostView && (showReplies || isModQueue) && (
                <div className={styles.postLink}>
                  <span className={styles.info}>
                    {replyCount > 0 && `${replyCount} Replies`}
                    {linksCount > 0 && ` / ${linksCount} Links`}
                  </span>
                  {isModQueue ? (
                    <div className={styles.modQueueActions}>
                      {modQueueStatus === 'approved' ? (
                        <span className={styles.modQueueStatusApproved}>{t('approved')}</span>
                      ) : modQueueStatus === 'rejected' ? (
                        <span className={styles.modQueueStatusRejected}>{t('rejected')}</span>
                      ) : modQueueStatus === 'failed' ? (
                        <span className={styles.modQueueStatusRejected}>
                          {t('failed')}
                          {modQueueError ? `: ${modQueueError}` : ''}
                        </span>
                      ) : isPublishing ? (
                        <LoadingEllipsis string={t('publishing')} />
                      ) : (
                        <>
                          <button className={`button ${styles.approveButton}`} onClick={onApprove} disabled={isPublishing}>
                            {t('approve')}
                          </button>
                          <button className={`button ${styles.rejectButton}`} onClick={onReject} disabled={isPublishing}>
                            {t('reject')}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <Link to={boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`} className='button'>
                      {t('view_thread')}
                    </Link>
                  )}
                </div>
              )}
            </div>
            {/* Virtuoso infinite scroll for post page view when there's more content to paginate */}
            {!(pinned && !isInPostView) && showAllReplies && !isInPendingPostView && showReplies && hasMore && (
              <Virtuoso
                increaseViewportBy={{ bottom: 1200, top: 1200 }}
                totalCount={filteredReplies.length}
                data={filteredReplies}
                itemContent={(index, reply) => (
                  <div className={styles.replyContainer}>
                    <Reply postReplyCount={replyCount} reply={reply} roles={roles} threadNumber={post?.number} quotedByMap={quotedByMap} />
                  </div>
                )}
                useWindowScroll={true}
                components={{ Footer: virtuosoFooter }}
                endReached={loadMore}
                ref={virtuosoRef}
                restoreStateFrom={lastVirtuosoState}
                initialScrollTop={lastVirtuosoState?.scrollTop}
              />
            )}
            {/* Non-virtualized rendering for post page view when all replies fit on one page */}
            {!(pinned && !isInPostView) &&
              showAllReplies &&
              !isInPendingPostView &&
              showReplies &&
              !hasMore &&
              visibleReplies.map((reply, index) => (
                <div key={index} className={styles.replyContainer}>
                  <Reply postReplyCount={replyCount} reply={reply} roles={roles} threadNumber={post?.number} quotedByMap={quotedByMap} />
                </div>
              ))}
            {/* Non-virtualized rendering for board view (last 5 replies) */}
            {!(pinned && !isInPostView) &&
              !showAllReplies &&
              !isInPendingPostView &&
              repliesForRender &&
              showReplies &&
              filteredReplies.slice(-5).map((reply, index) => (
                <div key={index} className={styles.replyContainer}>
                  <Reply postReplyCount={replyCount} reply={reply} roles={roles} threadNumber={post?.number} quotedByMap={quotedByMap} />
                </div>
              ))}
          </div>
          {!isInPendingPostView && stateString && !hasFailedState && state !== 'succeeded' && isInPostPageView && !(!showReplies && !showAllReplies) ? (
            <div className={styles.stateString}>
              <LoadingEllipsis string={stateString} />
            </div>
          ) : (
            hasFailedState && <span className={styles.error}>{t('failed')}</span>
          )}
        </div>
      )}
    </>
  );
};

export default PostMobile;
