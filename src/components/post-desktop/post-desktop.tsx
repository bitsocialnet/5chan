import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { Virtuoso, VirtuosoHandle, StateSnapshot } from 'react-virtuoso';
import { Comment, useAuthorAvatar, useEditedComment, useReplies, useAccount } from '@plebbit/plebbit-react-hooks';
import Plebbit from '@plebbit/plebbit-js';
import styles from '../../views/post/post.module.css';
import { CommentMediaInfo, getDisplayMediaInfoType, getHasThumbnail, getMediaDimensions } from '../../lib/utils/media-utils';
import { hashStringToColor, getTextColorForBackground } from '../../lib/utils/post-utils';
import { getFormattedDate, getFormattedTimeAgo } from '../../lib/utils/time-utils';
import { isValidURL } from '../../lib/utils/url-utils';
import { isAllView, isModQueueView, isPendingPostView, isPostPageView, isSubscriptionsView } from '../../lib/utils/view-utils';
import { formatUserIDForDisplay } from '../../lib/utils/string-utils';
import useModQueueStore from '../../stores/use-mod-queue-store';
import { useDirectories } from '../../hooks/use-directories';
import { getBoardPath } from '../../lib/utils/route-utils';
import useAvatarVisibilityStore from '../../stores/use-avatar-visibility-store';
import useAuthorAddressClick from '../../hooks/use-author-address-click';
import { useCommentMediaInfo } from '../../hooks/use-comment-media-info';
import useCountLinksInReplies from '../../hooks/use-count-links-in-replies';
import useFetchGifFirstFrame from '../../hooks/use-fetch-gif-first-frame';
import useHide from '../../hooks/use-hide';
import useStateString from '../../hooks/use-state-string';
import useScrollToReply from '../../hooks/use-scroll-to-reply';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import CommentContent from '../comment-content';
import CommentMedia from '../comment-media';
import EditMenu from '../edit-menu/edit-menu';
import { canEmbed } from '../embed';
import LoadingEllipsis from '../loading-ellipsis';
import PostMenuDesktop from './post-menu-desktop';
import ReplyQuotePreview from '../reply-quote-preview';
import Tooltip from '../tooltip';
import { PostProps } from '../../views/post/post';
import { create } from 'zustand';
import _ from 'lodash';
import { shouldShowSnow } from '../../lib/snow';
import useReplyModalStore from '../../stores/use-reply-modal-store';
import { selectPostMenuProps } from '../../lib/utils/post-menu-props';
import useChallengesStore from '../../stores/use-challenges-store';
import { alertChallengeVerificationFailed } from '../../lib/utils/challenge-utils';
import { usePublishCommentModeration } from '@plebbit/plebbit-react-hooks';

const { addChallenge } = useChallengesStore.getState();

// Store scroll position for replies virtuoso across navigations
const lastVirtuosoStates: { [key: string]: StateSnapshot } = {};

interface ShowOmittedRepliesState {
  showOmittedReplies: Record<string, boolean>;
  setShowOmittedReplies: (cid: string, showOmittedReplies: boolean) => void;
}

const useShowOmittedReplies = create<ShowOmittedRepliesState>((set) => ({
  showOmittedReplies: {},
  setShowOmittedReplies: (cid, showOmittedReplies) =>
    set((state) => ({
      showOmittedReplies: {
        ...state.showOmittedReplies,
        [cid]: showOmittedReplies,
      },
    })),
}));

const PostInfo = ({
  post,
  postReplyCount = 0,
  roles,
  isHidden,
  threadNumber,
  isModQueue,
  modQueueStatus,
  modQueueError,
  isPublishing,
  onApprove,
  onReject,
  quotedByMap,
}: PostProps) => {
  const { t } = useTranslation();
  const { author, cid, deleted, locked, pinned, parentCid, postCid, reason, removed, state, subplebbitAddress, timestamp } = post || {};
  const title = post?.title?.trim();
  const { replies } = useReplies({ comment: post, accountComments: { newerThan: Infinity } });
  const { address, shortAddress } = author || {};
  const displayName = author?.displayName?.trim();
  const authorRole = roles?.[address]?.role?.replace('moderator', 'mod');
  const stateString = useStateString(post);
  const isReply = parentCid;
  const { showOmittedReplies } = useShowOmittedReplies();
  const { imageUrl: avatarImageUrl } = useAuthorAvatar({ author });
  const { hideAvatars } = useAvatarVisibilityStore();
  const directories = useDirectories();
  const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : undefined;
  const postMenuProps = useMemo(() => selectPostMenuProps(post), [post]);

  const params = useParams();
  const location = useLocation();
  const isInPostPageView = isPostPageView(location.pathname, params);
  const isInModQueueView = isModQueueView(location.pathname);
  const { getAlertThresholdSeconds } = useModQueueStore();
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

  // Check if post is awaiting approval and over threshold (for mod queue view)
  const approved = post?.approved;
  const alreadyApproved = approved === true;
  const alreadyRejected = removed === true;
  const isAwaitingApproval = isInModQueueView && !alreadyApproved && !alreadyRejected;
  const timeWaiting = timestamp ? Date.now() / 1000 - timestamp : 0;
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const isOverThreshold = isAwaitingApproval && timeWaiting > alertThresholdSeconds;

  const userID = address && Plebbit.getShortAddress({ address }); // shortened to 8 chars for display; users can verify the full user ID via "Copy user ID" in the post menu to guard against spoofing
  const userIDBackgroundColor = hashStringToColor(userID);
  const userIDTextColor = getTextColorForBackground(userIDBackgroundColor);

  const handleUserAddressClick = useAuthorAddressClick();
  const numberOfPostsByAuthor = document.querySelectorAll(`[data-author-address="${shortAddress}"][data-post-cid="${postCid}"]`).length;

  const pseudonymityMode = useSubplebbitField(subplebbitAddress, (sub) => sub?.features?.pseudonymityMode);
  const showUserID = pseudonymityMode !== 'per-reply';

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
    <div className={styles.postInfo}>
      {isHidden ? parentCid && <span className={styles.hiddenReplyEditMenuSpacer} /> : <EditMenu post={post} />}
      <span className={(hidden || ((removed || deleted) && !reason)) && parentCid ? styles.postDesktopHidden : ''}>
        {title &&
          (title.length <= 75 ? (
            <span className={styles.subject}>{title} </span>
          ) : (
            <Tooltip
              children={<span className={styles.subject}>{title.slice(0, 75) + '(...)'} </span>}
              content={title.length < 1000 ? title : title.slice(0, 1000) + `... ${t('title_too_long')}`}
            />
          ))}
        <span className={styles.nameBlock}>
          <span className={`${styles.name} ${authorRole && !(deleted || removed) && (authorRole === 'mod' ? styles.capcodeMod : styles.capcodeAdmin)}`}>
            {deleted ? (
              _.capitalize(t('deleted'))
            ) : removed ? (
              _.capitalize(t('removed'))
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
              _.capitalize(t('anonymous'))
            )}
            {!(deleted || removed) && authorRole && (
              <span className='capitalize'>
                {' '}
                ## Board {authorRole}{' '}
                <span
                  className={`${styles.capcodeIcon} ${authorRole === 'mod' ? styles.capcodeModIcon : styles.capcodeAdminIcon}`}
                  title={authorRole === 'mod' ? t('moderator_of_this_board') : t('administrator_of_this_board')}
                />
              </span>
            )}{' '}
          </span>
          {author?.avatar && !(deleted || removed) && !hideAvatars && avatarImageUrl ? (
            <span className={styles.authorAvatar}>
              <img src={avatarImageUrl} alt='' />
            </span>
          ) : null}
          {showUserID && (
            <>
              (ID:{' '}
              {deleted ? (
                t('deleted')
              ) : removed ? (
                t('removed')
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
                  showTooltip={isInPostPageView || showOmittedReplies[postCid] || (postReplyCount < 6 && !pinned)}
                />
              )}
              ){' '}
            </>
          )}
        </span>
        <span className={styles.dateTime}>
          {isInModQueueView && isOverThreshold ? (
            <>
              <Tooltip children={<span>{getFormattedDate(timestamp)}</span>} content={getFormattedTimeAgo(timestamp)} /> (
              <span className={styles.alert}>{getFormattedTimeAgo(timestamp)}</span>)
            </>
          ) : (
            <Tooltip children={<span>{getFormattedDate(timestamp)}</span>} content={getFormattedTimeAgo(timestamp)} />
          )}{' '}
        </span>
        <span className={styles.postNum}>
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
              <span className={styles.pendingCid}>
                {state === 'failed' || stateString === 'Failed' ? _.capitalize(t('failed')) : state === 'pending' ? _.capitalize(t('pending')) : ''}
              </span>
            </>
          )}
          {pinned && (
            <span className={`${styles.stickyIconWrapper} ${!locked && styles.addPaddingBeforeReply}`}>
              <img src='assets/icons/sticky.gif' alt='' className={styles.stickyIcon} title={t('sticky')} />
            </span>
          )}
          {locked && (
            <span className={`${styles.closedIconWrapper} ${styles.addPaddingBeforeReply} ${pinned && styles.addPaddingInBetween}`}>
              <img src='assets/icons/closed.gif' alt='' className={styles.closedIcon} title={t('closed')} />
            </span>
          )}
          {!isInPostPageView && !isReply && !isHidden && !isModQueue && (
            <span className={styles.replyButton}>
              [
              <Link to={boardPath ? `/${boardPath}/thread/${postCid}` : `/thread/${postCid}`} onClick={(e) => !cid && e.preventDefault()}>
                {_.capitalize(t('reply'))}
              </Link>
              ]
            </span>
          )}
          {isModQueue && (
            <span className={styles.modQueueActions}>
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
                  <span className={styles.modQueueButtonWrapper}>
                    [
                    <button className={styles.modQueueActionButton} onClick={onApprove} disabled={isPublishing}>
                      {t('approve')}
                    </button>
                    ]
                  </span>
                  <span className={styles.modQueueButtonWrapper}>
                    [
                    <button className={styles.modQueueActionButton} onClick={onReject} disabled={isPublishing}>
                      {t('reject')}
                    </button>
                    ]
                  </span>
                </>
              )}
            </span>
          )}
          {shouldShowPendingApprovalButtons && (
            <span className={styles.modQueueActions}>
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
                  <span className={styles.modQueueButtonWrapper}>
                    [
                    <button className={styles.modQueueActionButton} onClick={handlePendingApprove} disabled={isPublishingPending}>
                      {t('approve')}
                    </button>
                    ]
                  </span>
                  <span className={styles.modQueueButtonWrapper}>
                    [
                    <button className={styles.modQueueActionButton} onClick={handlePendingReject} disabled={isPublishingPending}>
                      {t('reject')}
                    </button>
                    ]
                  </span>
                </>
              )}
            </span>
          )}
        </span>
        {!(removed || deleted) && !isModQueue && <PostMenuDesktop postMenu={postMenuProps} />}
        {cid &&
          parentCid &&
          replies &&
          replies.map(
            (reply: Comment, index: number) =>
              reply?.parentCid === cid &&
              reply?.cid &&
              !(reply?.deleted || reply?.removed) && <ReplyQuotePreview key={index} isBacklinkReply={true} backlinkReply={reply} />,
          )}
        {cid &&
          parentCid &&
          quotedByMap
            ?.get(cid)
            ?.map(
              (reply: Comment, index: number) =>
                reply?.parentCid !== cid &&
                reply?.cid &&
                !(reply?.deleted || reply?.removed) && <ReplyQuotePreview key={`qb-${index}`} isBacklinkReply={true} backlinkReply={reply} />,
            )}
      </span>
    </div>
  );
};

interface PostMediaProps {
  commentMediaInfo: CommentMediaInfo | undefined;
  hasThumbnail: boolean;
  spoiler: boolean;
  deleted: boolean;
  removed: boolean;
  linkHeight: number;
  linkWidth: number;
  parentCid: string;
  subplebbitAddress: string;
  isInAllView: boolean;
  isInSubscriptionsView: boolean;
}

const PostMedia = ({
  commentMediaInfo,
  hasThumbnail,
  spoiler,
  deleted,
  removed,
  linkHeight,
  linkWidth,
  parentCid,
  subplebbitAddress,
  isInAllView,
  isInSubscriptionsView,
}: PostMediaProps) => {
  const { t } = useTranslation();
  const { url } = commentMediaInfo || {};
  let type = commentMediaInfo?.type;
  const gifFrameUrl = useFetchGifFirstFrame(url);
  const directories = useDirectories();

  if (type === 'gif' && gifFrameUrl !== null) {
    type = 'animated gif';
  } else if (type === 'gif' && gifFrameUrl === null) {
    type = 'static gif';
  }

  const embedUrl = url && new URL(url);
  const [showThumbnail, setShowThumbnail] = useState(true);

  const mediaDimensions = getMediaDimensions(commentMediaInfo);
  const boardPath = getBoardPath(subplebbitAddress, directories);

  return (
    <div className={styles.file}>
      <div className={styles.fileText}>
        {subplebbitAddress && (isInAllView || isInSubscriptionsView) && boardPath && !parentCid && (
          <>
            {t('board')}: <Link to={`/${boardPath}`}>{boardPath}</Link>{' '}
          </>
        )}
        {t('link')}:{' '}
        <a href={url} target='_blank' rel='noopener noreferrer'>
          {spoiler ? _.capitalize(t('spoiler')) : url && url.length > 30 ? url.slice(0, 30) + '...' : url}
        </a>{' '}
        ({type && _.lowerCase(getDisplayMediaInfoType(type, t))}
        {mediaDimensions && `, ${mediaDimensions}`})
        {!showThumbnail && (type === 'iframe' || type === 'video' || type === 'audio') && (
          <span>
            -[
            <span className={styles.closeMedia} onClick={() => setShowThumbnail(true)}>
              {t('close')}
            </span>
            ]
          </span>
        )}
        {showThumbnail && !hasThumbnail && embedUrl && canEmbed(embedUrl) && (
          <span>
            -[
            <span className={styles.closeMedia} onClick={() => setShowThumbnail(false)}>
              {t('open')}
            </span>
            ]
          </span>
        )}
      </div>
      {(hasThumbnail || (!hasThumbnail && !showThumbnail) || spoiler) && (
        <div className={styles.fileThumbnail}>
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
        </div>
      )}
    </div>
  );
};

const Reply = ({ postReplyCount, reply, roles, threadNumber, quotedByMap }: PostProps) => {
  let post = reply;
  // handle pending mod or author edit
  const { editedComment } = useEditedComment({ comment: reply });
  if (editedComment) {
    post = editedComment;
  }

  const { author, cid, deleted, link, linkHeight, linkWidth, postCid, reason, removed, spoiler, subplebbitAddress, thumbnailUrl, parentCid } = post || {};
  const directories = useDirectories();
  const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : undefined;

  const location = useLocation();
  const route = boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`;
  const isRouteLinkToReply = cid ? location.pathname.startsWith(route) : false;
  const { hidden } = useHide({ cid });

  const isInAllView = isAllView(location.pathname);
  const params = useParams();
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);

  const commentMediaInfo = useCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);

  return (
    <div className={styles.replyDesktop}>
      <div className={styles.sideArrows}>{'>>'}</div>
      <div className={`${styles.reply} ${isRouteLinkToReply && styles.highlight}`} data-cid={cid} data-author-address={author?.shortAddress} data-post-cid={postCid}>
        <PostInfo post={post} postReplyCount={postReplyCount} roles={roles} isHidden={hidden} threadNumber={threadNumber} quotedByMap={quotedByMap} />
        {link && !hidden && !(deleted || removed) && isValidURL(link) && (
          <PostMedia
            commentMediaInfo={commentMediaInfo}
            hasThumbnail={hasThumbnail}
            spoiler={spoiler}
            deleted={deleted}
            removed={removed}
            linkHeight={linkHeight}
            linkWidth={linkWidth}
            parentCid={parentCid}
            subplebbitAddress={subplebbitAddress}
            isInAllView={isInAllView}
            isInSubscriptionsView={isInSubscriptionsView}
          />
        )}
        {!hidden && (!(removed || deleted) || ((removed || deleted) && reason)) && <CommentContent comment={post} />}
      </div>
    </div>
  );
};

const PostDesktop = ({
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
  const { author, cid, content, deleted, link, linkHeight, linkWidth, pinned, postCid, removed, spoiler, state, subplebbitAddress, thumbnailUrl, parentCid } = post || {};
  const params = useParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const isInPendingPostView = isPendingPostView(location.pathname, params);
  const isInPostPageView = isPostPageView(location.pathname, params);
  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
  const directories = useDirectories();
  const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : undefined;

  const { hidden, unhide, hide } = useHide({ cid });
  const isHidden = hidden && !isInPostPageView;

  const { replies, hasMore, loadMore } = useReplies({ comment: post, flat: true, accountComments: { newerThan: Infinity } });
  const visiblelinksCount = useCountLinksInReplies(post, 5);
  const totalLinksCount = useCountLinksInReplies(post);
  const replyCount = replies?.length;

  const repliesCount = pinned ? replyCount : replyCount - 5;
  const linksCount = pinned ? totalLinksCount : totalLinksCount - visiblelinksCount;
  const { showOmittedReplies, setShowOmittedReplies } = useShowOmittedReplies();

  const stateString = useStateString(post) || t('downloading_board');

  const commentMediaInfo = useCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);

  // Filter out deleted replies with no children for both virtuoso and non-virtuoso rendering
  const filteredReplies = useMemo(() => (replies || []).filter((reply) => !(reply.deleted && (reply.replyCount === 0 || !reply.replyCount))), [replies]);

  // Compute quotedByMap: map each quoted CID to array of replies that quote it
  const quotedByMap = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const reply of filteredReplies) {
      const quotedCids = reply.quotedCids;
      if (quotedCids?.length) {
        for (const quotedCid of quotedCids) {
          const arr = map.get(quotedCid);
          if (arr) arr.push(reply);
          else map.set(quotedCid, [reply]);
        }
      }
    }
    return map;
  }, [filteredReplies]);

  // Virtuoso scroll position management for infinite replies
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const virtuosoStateKey = `replies-desktop-${cid}`;

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
    window.addEventListener('scroll', setLastVirtuosoState);
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

  // Footer component for Virtuoso showing loading state
  const RepliesFooter = () =>
    hasMore ? (
      <div className={styles.stateString}>
        <LoadingEllipsis string={t('loading')} />
      </div>
    ) : null;

  return (
    <div className={styles.postDesktop}>
      {showReplies || isModQueue ? (
        <div className={styles.hrWrapper}>
          <hr />
        </div>
      ) : (
        <div className={styles.replyQuotePreviewSpacer} />
      )}
      <div className={isHidden ? styles.postDesktopHidden : ''}>
        {!isInPostPageView && showReplies && (
          <span className={`${styles.hideButtonWrapper} ${!hasThumbnail ? styles.hideButtonWrapperNoImage : ''}`}>
            <span className={`${styles.hideButton} ${hidden ? styles.unhideThread : styles.hideThread}`} onClick={hidden ? unhide : hide} />
          </span>
        )}
        <div
          data-cid={cid}
          data-author-address={author?.shortAddress}
          data-post-cid={postCid}
          className={`${styles.opContainer} ${shouldShowSnow() && hasThumbnail ? styles.xmasHatWrapper : ''}`}
        >
          {shouldShowSnow() && hasThumbnail && <img src='assets/xmashat.gif' className={styles.xmasHat} alt='' />}
          {link && !isHidden && !(deleted || removed) && isValidURL(link) && (
            <PostMedia
              commentMediaInfo={commentMediaInfo}
              hasThumbnail={hasThumbnail}
              spoiler={spoiler}
              deleted={deleted}
              removed={removed}
              linkHeight={linkHeight}
              linkWidth={linkWidth}
              parentCid={parentCid}
              subplebbitAddress={subplebbitAddress}
              isInAllView={isInAllView}
              isInSubscriptionsView={isInSubscriptionsView}
            />
          )}
          <PostInfo
            isHidden={hidden}
            post={post}
            postReplyCount={replyCount}
            roles={roles}
            threadNumber={post?.number}
            isModQueue={isModQueue}
            modQueueStatus={modQueueStatus}
            modQueueError={modQueueError}
            isPublishing={isPublishing}
            onApprove={onApprove}
            onReject={onReject}
          />
          {!isHidden && !content && !(deleted || removed) && <div className={styles.spacer} />}
          {!isHidden && <CommentContent comment={post} />}
        </div>
        {!isHidden && !isInPendingPostView && (replyCount > 5 || (pinned && repliesCount > 0)) && !isInPostPageView && (
          <span className={styles.summary}>
            <span
              className={`${showOmittedReplies[cid] ? styles.hideOmittedReplies : styles.showOmittedReplies} ${styles.omittedRepliesButtonWrapper}`}
              onClick={() => setShowOmittedReplies(cid, !showOmittedReplies[cid])}
            />
            {showOmittedReplies[cid] ? (
              t('showing_all_replies')
            ) : linksCount > 0 ? (
              <Trans
                i18nKey={'replies_and_links_omitted'}
                shouldUnescape={true}
                components={{ 1: <Link key={cid} to={boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`} /> }}
                values={{ repliesCount, linksCount }}
              />
            ) : (
              <Trans
                i18nKey={'replies_omitted'}
                shouldUnescape={true}
                components={{ 1: <Link key={cid} to={boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`} /> }}
                values={{ repliesCount }}
              />
            )}
          </span>
        )}
        {/* Virtuoso infinite scroll for post page view when there's more content to paginate */}
        {!isHidden && showAllReplies && !isInPendingPostView && showReplies && hasMore && (
          <Virtuoso
            increaseViewportBy={{ bottom: 1200, top: 1200 }}
            totalCount={filteredReplies.length}
            data={filteredReplies}
            itemContent={(index, reply) => (
              <div className={styles.replyContainer}>
                <Reply reply={reply} roles={roles} postReplyCount={replyCount} threadNumber={post?.number} quotedByMap={quotedByMap} />
              </div>
            )}
            useWindowScroll={true}
            components={{ Footer: RepliesFooter }}
            endReached={loadMore}
            ref={virtuosoRef}
            restoreStateFrom={lastVirtuosoState}
            initialScrollTop={lastVirtuosoState?.scrollTop}
          />
        )}
        {/* Non-virtualized rendering for post page view when all replies fit on one page */}
        {!isHidden &&
          showAllReplies &&
          !isInPendingPostView &&
          showReplies &&
          !hasMore &&
          filteredReplies.map((reply, index) => (
            <div key={index} className={styles.replyContainer}>
              <Reply reply={reply} roles={roles} postReplyCount={replyCount} threadNumber={post?.number} quotedByMap={quotedByMap} />
            </div>
          ))}
        {/* Non-virtualized rendering for board view (last 5 replies or show omitted) */}
        {!isHidden &&
          !showAllReplies &&
          !(pinned && !isInPostPageView && !showOmittedReplies[cid]) &&
          !isInPendingPostView &&
          replies &&
          showReplies &&
          (showOmittedReplies[cid] ? filteredReplies : filteredReplies.slice(-5)).map((reply, index) => (
            <div key={index} className={styles.replyContainer}>
              <Reply reply={reply} roles={roles} postReplyCount={replyCount} threadNumber={post?.number} quotedByMap={quotedByMap} />
            </div>
          ))}
      </div>
      {!isInPendingPostView && stateString && stateString !== 'Failed' && state !== 'succeeded' && isInPostPageView && !(!showReplies && !showAllReplies) ? (
        <div className={styles.stateString}>
          <br />
          <LoadingEllipsis string={stateString} />
        </div>
      ) : (
        state === 'failed' && <span className={styles.error}>{t('failed')}</span>
      )}
    </div>
  );
};

export default PostDesktop;
