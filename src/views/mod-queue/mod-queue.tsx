import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useFeed, Comment, usePublishCommentModeration, useEditedComment, useCommunity } from '@bitsocialnet/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import styles from './mod-queue.module.css';
import useModQueueStore from '../../stores/use-mod-queue-store';
import LoadingEllipsis from '../../components/loading-ellipsis';
import ErrorDisplay from '../../components/error-display/error-display';
import { useFeedStateString } from '../../hooks/use-state-string';
import { getSubplebbitAddress, getBoardPath, extractDirectoryFromTitle } from '../../lib/utils/route-utils';
import { useDirectories, DirectoryCommunity } from '../../hooks/use-directories';
import getShortAddress from '../../lib/get-short-address';
import { BOARD_CODE_GROUPS } from '../../constants/board-codes';
import { getHasThumbnail, getCommentMediaInfo } from '../../lib/utils/media-utils';
import {
  approvePendingCommentModeration,
  isPendingApprovalAwaiting,
  isPendingApprovalRejected,
  rejectPendingCommentModeration,
} from '../../lib/utils/pending-approval-moderation';
import { getFormattedDate, getFormattedTimeAgo } from '../../lib/utils/time-utils';
import useFeedResetStore from '../../stores/use-feed-reset-store';
import useChallengesStore from '../../stores/use-challenges-store';
import { alertChallengeVerificationFailed } from '../../lib/utils/challenge-utils';
import Tooltip from '../../components/tooltip';
import { useAccountCommunityAddresses } from '../../hooks/use-account-community-addresses';
import useIsMobile from '../../hooks/use-is-mobile';
import { useCurrentTime } from '../../hooks/use-current-time';
import { Post } from '../post/post';
import capitalize from 'lodash/capitalize';
import lowerCase from 'lodash/lowerCase';
import { PageFooterDesktop, PageFooterMobile, StyleOnlyFooterFirstRow } from '../../components/footer';
import footerStyles from '../../components/footer/footer.module.css';

const { addChallenge } = useChallengesStore.getState();

/** Path for display: directory code, or full address if has TLD, or shortened for long IPNS keys (no dot) */
const getBoardDisplayPath = (address: string, path: string): string => {
  if (path !== address) return path;
  if (address.includes('.')) return address;
  return getShortAddress(address) || address;
};

const getCommentCommunityAddress = (comment: Comment) => comment?.communityAddress || comment?.subplebbitAddress;

interface ModQueueViewProps {
  boardIdentifier?: string; // If provided, shows queue for single board
}

interface ModQueueFooterProps {
  hasMore: boolean;
  communityAddresses: string[];
}

// Defined outside ModQueueView to preserve component identity across renders (Virtuoso optimization)
// The useFeedStateString hook is called here instead of in ModQueueView to isolate re-renders
// caused by backend IPFS state changes to just this footer component
const ModQueueFooter = ({ hasMore, communityAddresses }: ModQueueFooterProps) => {
  const { t } = useTranslation();
  const loadingStateString = useFeedStateString(communityAddresses) || t('loading');

  return hasMore ? (
    <div className={styles.footer}>
      <LoadingEllipsis string={loadingStateString} />
    </div>
  ) : null;
};

interface ModQueueRowProps {
  comment: Comment;
  isOdd?: boolean;
  showBoard?: boolean;
  /** Board path for URLs (directory code or full address) */
  boardPath: string | undefined;
  /** Board path for display (shortened when long IPNS key with no TLD) */
  boardDisplayPath: string | undefined;
}

// Track which action was initiated to show appropriate completion message
type ModerationAction = 'approve' | 'reject' | null;

interface ModQueueActionState {
  status: 'approved' | 'rejected' | 'failed' | null;
  errorMessage?: string;
  isPublishing: boolean;
  handleApprove: () => Promise<void>;
  handleReject: () => Promise<void>;
}

interface ModQueueActionsProps {
  status: 'approved' | 'rejected' | 'failed' | null;
  errorMessage?: string;
  isPublishing: boolean;
  handleApprove: () => Promise<void>;
  handleReject: () => Promise<void>;
  variant: 'row' | 'card';
}

const ModQueueActions = ({ status, errorMessage, isPublishing, handleApprove, handleReject, variant }: ModQueueActionsProps) => {
  const { t } = useTranslation();

  if (status === 'approved') {
    const content = <span className={`${styles.button} ${styles.approve}`}>{t('approved')}</span>;
    return variant === 'card' ? <div className={styles.cardActions}>{content}</div> : content;
  }
  if (status === 'rejected') {
    const content = <span className={`${styles.button} ${styles.reject}`}>{t('rejected')}</span>;
    return variant === 'card' ? <div className={styles.cardActions}>{content}</div> : content;
  }
  if (status === 'failed') {
    const content = (
      <span className={`${styles.button} ${styles.reject}`}>
        {t('failed')}
        {errorMessage ? `: ${errorMessage}` : ''}
      </span>
    );
    return variant === 'card' ? <div className={styles.cardActions}>{content}</div> : content;
  }
  if (isPublishing) {
    const content = <LoadingEllipsis string={t('publishing')} />;
    return variant === 'card' ? <div className={styles.cardActions}>{content}</div> : content;
  }

  const buttons =
    variant === 'row' ? (
      <div className={styles.actionButtons}>
        <span className={styles.buttonWrapper}>
          [
          <button className={styles.button} onClick={handleApprove} disabled={isPublishing}>
            {t('approve')}
          </button>
          ]
        </span>
        <span className={styles.buttonWrapper}>
          [
          <button className={styles.button} onClick={handleReject} disabled={isPublishing}>
            {t('reject')}
          </button>
          ]
        </span>
      </div>
    ) : (
      <div className={styles.cardActions}>
        <button className={`button ${styles.cardApproveButton}`} onClick={handleApprove} disabled={isPublishing}>
          {t('approve')}
        </button>
        <button className={`button ${styles.cardRejectButton}`} onClick={handleReject} disabled={isPublishing}>
          {t('reject')}
        </button>
      </div>
    );

  return buttons;
};

const useModQueueActions = (comment: Comment): ModQueueActionState => {
  const { t } = useTranslation();
  const { cid, approved, removed, pendingApproval } = comment || {};
  const communityAddress = comment?.communityAddress || comment?.subplebbitAddress;
  const [initiatedAction, setInitiatedAction] = useState<ModerationAction>(null);

  const alreadyApproved = approved === true;
  const alreadyRejected = isPendingApprovalRejected({ approved, removed, pendingApproval });

  const {
    publishCommentModeration: approve,
    state: approveState,
    error: approveError,
  } = usePublishCommentModeration({
    commentCid: cid,
    communityAddress,
    commentModeration: approvePendingCommentModeration,
    onChallenge: async (...args: any) => {
      addChallenge([...args, comment]);
    },
    onChallengeVerification: async (challengeVerification, comment) => {
      alertChallengeVerificationFailed(challengeVerification, comment);
    },
    onError: (error: Error) => {
      console.error('Approve failed:', error);
    },
  });

  const {
    publishCommentModeration: reject,
    state: rejectState,
    error: rejectError,
  } = usePublishCommentModeration({
    commentCid: cid,
    communityAddress,
    commentModeration: rejectPendingCommentModeration,
    onChallenge: async (...args: any) => {
      addChallenge([...args, comment]);
    },
    onChallengeVerification: async (challengeVerification, comment) => {
      alertChallengeVerificationFailed(challengeVerification, comment);
    },
    onError: (error: Error) => {
      console.error('Reject failed:', error);
    },
  });

  const handleApprove = useCallback(async () => {
    const confirm = window.confirm(t('double_confirm'));
    if (!confirm) {
      return;
    }

    setInitiatedAction('approve');
    try {
      await approve();
    } catch (e) {
      console.error(e);
    }
  }, [approve, t]);

  const handleReject = useCallback(async () => {
    const confirm = window.confirm(t('double_confirm'));
    if (!confirm) {
      return;
    }

    setInitiatedAction('reject');
    try {
      await reject();
    } catch (e) {
      console.error(e);
    }
  }, [reject, t]);

  const isApproving = initiatedAction === 'approve' && approveState !== 'initializing' && approveState !== 'succeeded' && approveState !== 'failed';
  const isRejecting = initiatedAction === 'reject' && rejectState !== 'initializing' && rejectState !== 'succeeded' && rejectState !== 'failed';
  const isPublishing = isApproving || isRejecting;

  const approveSucceeded = initiatedAction === 'approve' && approveState === 'succeeded';
  const rejectSucceeded = initiatedAction === 'reject' && rejectState === 'succeeded';

  const approveFailed = initiatedAction === 'approve' && approveState === 'failed';
  const rejectFailed = initiatedAction === 'reject' && rejectState === 'failed';

  const status = alreadyApproved || approveSucceeded ? 'approved' : alreadyRejected || rejectSucceeded ? 'rejected' : approveFailed || rejectFailed ? 'failed' : null;
  const errorMessage = approveFailed ? approveError?.message : rejectFailed ? rejectError?.message : undefined;

  return { status, errorMessage, isPublishing, handleApprove, handleReject };
};

const ModQueueRow = memo(({ comment, isOdd = false, showBoard = false, boardPath, boardDisplayPath }: ModQueueRowProps) => {
  const { t } = useTranslation();
  const { getAlertThresholdSeconds } = useModQueueStore();
  const isMobile = useIsMobile();
  const currentTime = useCurrentTime();

  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;

  const { content, title, timestamp, cid, threadCid, link, thumbnailUrl, linkWidth, linkHeight, removed, approved, pendingApproval, number, parentCid } = displayComment;
  const commentCommunityAddress = getCommentCommunityAddress(displayComment);

  // Check if already moderated (from previous session or API update)
  // Note: `approved` and `removed` are direct fields on the comment from CommentUpdate,
  // not nested under commentModeration (which is the options object for publishing moderation actions)
  const alreadyApproved = approved === true;
  const alreadyRejected = isPendingApprovalRejected({ approved, removed, pendingApproval });

  const timeWaiting = currentTime - timestamp;
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const isOverThreshold = timeWaiting > alertThresholdSeconds;

  // Only show alert animation for comments awaiting approval (not approved or rejected)
  const isAwaitingApproval = isPendingApprovalAwaiting(displayComment);

  const { status, errorMessage, isPublishing, handleApprove, handleReject } = useModQueueActions(displayComment);
  const hasTitle = title && title.trim().length > 0;
  const hasContent = content && content.trim().length > 0;
  const hasLink = link && link.length > 0;
  const isReply = !!parentCid;
  const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);
  const rawExcerpt = (
    (hasTitle && hasContent ? `${title}: ${content}` : null) ||
    (hasTitle ? title : null) ||
    (hasContent ? content : null) ||
    (hasLink ? link : null) ||
    (hasThumbnail ? t('image') : null) ||
    t('no_content')
  ).trim();
  // Only truncate excerpt on desktop, allow wrapping on mobile
  const excerpt = !isMobile && rawExcerpt.length > 101 ? rawExcerpt.slice(0, 98) + '...' : rawExcerpt;
  const threadTargetCid = threadCid || cid;
  const postUrl = boardPath && threadTargetCid ? `/${boardPath}/thread/${threadTargetCid}` : undefined;

  const modQueueUrl = boardPath ? `/${boardPath}/mod/queue` : undefined;

  return (
    <div className={`${styles.row} ${isOdd ? styles.rowOdd : ''}`}>
      <div className={styles.number}>{number ?? 'N/A'}</div>
      {showBoard && (
        <div className={styles.board}>{modQueueUrl ? <Link to={modQueueUrl}>/{boardDisplayPath ?? '—'}/</Link> : <span>/{boardDisplayPath ?? '—'}/</span>}</div>
      )}
      <div className={styles.excerpt}>
        {postUrl ? (
          <Link to={postUrl} title={excerpt}>
            {excerpt}
          </Link>
        ) : (
          <span title={excerpt}>{excerpt}</span>
        )}
      </div>
      <div className={styles.time}>
        {isMobile ? (
          // On mobile, show shorter time ago format without tooltip
          isAwaitingApproval && isOverThreshold ? (
            <span className={styles.alert}>{getFormattedTimeAgo(timestamp)}</span>
          ) : (
            <span>{getFormattedTimeAgo(timestamp)}</span>
          )
        ) : // On desktop, show full date with tooltip
        isAwaitingApproval && isOverThreshold ? (
          <>
            <Tooltip content={getFormattedTimeAgo(timestamp)}>
              <span>{getFormattedDate(timestamp)}</span>
            </Tooltip>
            <span className={styles.alertWrapper}>
              {' '}
              (<span className={styles.alert}>{getFormattedTimeAgo(timestamp)}</span>)
            </span>
          </>
        ) : (
          <Tooltip content={getFormattedTimeAgo(timestamp)}>
            <span>{getFormattedDate(timestamp)}</span>
          </Tooltip>
        )}
      </div>
      <div className={styles.type}>{isReply ? capitalize(t('reply')) : capitalize(t('post'))}</div>
      <div className={styles.image}>{hasThumbnail ? t('yes') : t('no')}</div>
      <div className={styles.actions}>
        <ModQueueActions
          status={status}
          errorMessage={errorMessage}
          isPublishing={isPublishing}
          handleApprove={handleApprove}
          handleReject={handleReject}
          variant='row'
        />
      </div>
    </div>
  );
});
ModQueueRow.displayName = 'ModQueueRow';

interface ModQueueCardProps {
  comment: Comment;
  showBoard?: boolean;
  /** Board path for URLs (directory code or full address) */
  boardPath: string | undefined;
  /** Board path for display (shortened when long IPNS key with no TLD) */
  boardDisplayPath: string | undefined;
}

const ModQueueCard = memo(({ comment, showBoard = false, boardPath, boardDisplayPath }: ModQueueCardProps) => {
  const { t } = useTranslation();
  const { getAlertThresholdSeconds } = useModQueueStore();
  const currentTime = useCurrentTime();

  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;

  const { content, title, timestamp, cid, threadCid, link, thumbnailUrl, linkWidth, linkHeight, removed, approved, pendingApproval, number, parentCid } = displayComment;
  const commentCommunityAddress = getCommentCommunityAddress(displayComment);

  const alreadyApproved = approved === true;
  const alreadyRejected = isPendingApprovalRejected({ approved, removed, pendingApproval });

  const timeWaiting = currentTime - timestamp;
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const isOverThreshold = timeWaiting > alertThresholdSeconds;
  const isAwaitingApproval = isPendingApprovalAwaiting(displayComment);

  const { status, errorMessage, isPublishing, handleApprove, handleReject } = useModQueueActions(displayComment);
  const hasTitle = title && title.trim().length > 0;
  const hasContent = content && content.trim().length > 0;
  const hasLink = link && link.length > 0;
  const isReply = !!parentCid;
  const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);
  const rawExcerpt = (
    (hasTitle && hasContent ? `${title}: ${content}` : null) ||
    (hasTitle ? title : null) ||
    (hasContent ? content : null) ||
    (hasLink ? link : null) ||
    (hasThumbnail ? t('image') : null) ||
    t('no_content')
  ).trim();
  const excerpt = rawExcerpt.length > 140 ? rawExcerpt.slice(0, 137) + '...' : rawExcerpt;
  const threadTargetCid = threadCid || cid;
  const postUrl = boardPath && threadTargetCid ? `/${boardPath}/thread/${threadTargetCid}` : undefined;

  const modQueueUrl = boardPath ? `/${boardPath}/mod/queue` : undefined;

  return (
    <div className={styles.mobileCard}>
      <div className={styles.cardHeader}>
        <span className={styles.cardHeaderLeft}>
          <span className={styles.cardNumber}>No. {number ?? 'N/A'}</span>
          {showBoard && boardPath && (
            <>
              <span className={styles.cardBoardSeparator}> — </span>
              <span className={styles.cardBoard}>{modQueueUrl ? <Link to={modQueueUrl}>/{boardDisplayPath}/</Link> : <span>/{boardDisplayPath}/</span>}</span>
            </>
          )}
        </span>
        <span className={styles.cardTime}>
          {isAwaitingApproval && isOverThreshold ? (
            <>
              {getFormattedDate(timestamp)} (<span className={styles.alert}>{getFormattedTimeAgo(timestamp)}</span>)
            </>
          ) : (
            getFormattedDate(timestamp)
          )}
        </span>
      </div>
      <div className={styles.cardContent}>
        {t('excerpt')}:{' '}
        {postUrl ? (
          <Link to={postUrl} title={excerpt}>
            {excerpt}
          </Link>
        ) : (
          <span title={excerpt}>{excerpt}</span>
        )}{' '}
        / {t('type')}: {isReply ? t('reply') : t('post')} / {capitalize(t('image'))}: {hasThumbnail ? lowerCase(t('yes')) : lowerCase(t('no'))}
      </div>
      <ModQueueActions status={status} errorMessage={errorMessage} isPublishing={isPublishing} handleApprove={handleApprove} handleReject={handleReject} variant='card' />
    </div>
  );
});
ModQueueCard.displayName = 'ModQueueCard';

const ModQueueFeedPost = ({ comment }: { comment: Comment }) => {
  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;
  const { status, errorMessage, isPublishing, handleApprove, handleReject } = useModQueueActions(displayComment);

  return (
    <Post
      post={displayComment}
      showAllReplies={false}
      showReplies={false}
      isModQueue={true}
      modQueueStatus={status}
      modQueueError={errorMessage}
      isPublishing={isPublishing}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
};

interface ModQueueBoardSummaryProps {
  feed: Comment[];
  directories: DirectoryCommunity[];
  accountCommunityAddresses: string[];
}

const findBoardAddressByCode = (code: string, dirs: DirectoryCommunity[]): string | null => {
  const entry = dirs.find((sub) => {
    if (!sub.title) return false;
    const directory = extractDirectoryFromTitle(sub.title);
    return directory === code;
  });
  return entry?.address || null;
};

const ModQueueBoardSummary = ({ feed, directories, accountCommunityAddresses }: ModQueueBoardSummaryProps) => {
  const { t } = useTranslation();
  const { selectedBoardFilter, setSelectedBoardFilter, getAlertThresholdSeconds } = useModQueueStore();
  const currentTime = useCurrentTime();
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const modAddressSet = useMemo(() => new Set(accountCommunityAddresses), [accountCommunityAddresses]);

  const boardCounts = useMemo(() => {
    const counts = new Map<string, { normal: number; urgent: number }>();
    for (const address of accountCommunityAddresses) {
      counts.set(address, { normal: 0, urgent: 0 });
    }
    for (const item of feed) {
      const addr = getCommentCommunityAddress(item);
      if (!addr) continue;
      const entry = counts.get(addr);
      if (!entry) continue;
      const isAwaiting = isPendingApprovalAwaiting(item);
      if (!isAwaiting) continue;
      const timeWaiting = currentTime - (item.timestamp ?? 0);
      const isUrgent = timeWaiting > alertThresholdSeconds;
      if (isUrgent) entry.urgent++;
      else entry.normal++;
    }
    return counts;
  }, [feed, accountCommunityAddresses, currentTime, alertThresholdSeconds]);

  const { totalNormal, totalUrgent } = useMemo(() => {
    let normal = 0;
    let urgent = 0;
    for (const entry of boardCounts.values()) {
      normal += entry.normal;
      urgent += entry.urgent;
    }
    return { totalNormal: normal, totalUrgent: urgent };
  }, [boardCounts]);

  // Order: All first, then BOARD_CODE_GROUPS order (directory boards), then non-directory boards
  const orderedAddresses = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    for (const group of BOARD_CODE_GROUPS) {
      for (const code of group) {
        const address = findBoardAddressByCode(code, directories);
        if (address && modAddressSet.has(address) && !seen.has(address)) {
          ordered.push(address);
          seen.add(address);
        }
      }
    }
    // Directory boards not in BOARD_CODE_GROUPS (custom dirs)
    for (const addr of accountCommunityAddresses) {
      const path = getBoardPath(addr, directories);
      if (path !== addr && !seen.has(addr)) {
        ordered.push(addr);
        seen.add(addr);
      }
    }
    // Non-directory boards (own category, like subscriptions in boardsbar)
    for (const addr of accountCommunityAddresses) {
      if (!seen.has(addr)) {
        ordered.push(addr);
      }
    }
    return ordered;
  }, [accountCommunityAddresses, directories, modAddressSet]);

  const handleSelectAll = useCallback(() => setSelectedBoardFilter(null), [setSelectedBoardFilter]);
  const handleSelectBoard = useCallback((address: string) => setSelectedBoardFilter(address), [setSelectedBoardFilter]);

  if (accountCommunityAddresses.length === 0) {
    return null;
  }

  const renderCount = (normal: number, urgent: number) => {
    const total = normal + urgent;
    if (total === 0) return null;
    return (
      <strong>
        (
        {urgent > 0 && normal > 0 ? (
          <>
            <span className={styles.modQueueButtonCount}>{normal}</span>
            <span className={`${styles.modQueueButtonCount} ${styles.modQueueButtonCountAlert}`}>+{urgent}</span>
          </>
        ) : urgent > 0 ? (
          <span className={`${styles.modQueueButtonCount} ${styles.modQueueButtonCountAlert}`}>{urgent}</span>
        ) : (
          <span className={styles.modQueueButtonCount}>{total}</span>
        )}
        )
      </strong>
    );
  };

  return (
    <span className={styles.boardSummary}>
      <button type='button' className={`${styles.boardSummaryLink} ${!selectedBoardFilter ? styles.boardSummaryLinkSelected : ''}`} onClick={handleSelectAll}>
        {t('all')}
        {totalNormal + totalUrgent > 0 && <> {renderCount(totalNormal, totalUrgent)}</>}
      </button>
      {orderedAddresses.map((address) => {
        const boardPath = getBoardPath(address, directories);
        const isInDirectory = boardPath !== address;
        const displayText = isInDirectory ? boardPath : address.endsWith('.eth') || address.endsWith('.sol') ? address : getShortAddress(address) || address;
        const isSelected = selectedBoardFilter === address;
        const { normal, urgent } = boardCounts.get(address) ?? { normal: 0, urgent: 0 };

        return (
          <React.Fragment key={address}>
            {' / '}
            <button
              type='button'
              className={`${styles.boardSummaryLink} ${isSelected ? styles.boardSummaryLinkSelected : ''}`}
              onClick={() => handleSelectBoard(address)}
            >
              {displayText}
              {normal + urgent > 0 && <> {renderCount(normal, urgent)}</>}
            </button>
          </React.Fragment>
        );
      })}
    </span>
  );
};

interface ModQueueButtonProps {
  boardIdentifier?: string;
  isMobile?: boolean;
}

interface ModQueueCountItemProps {
  comment: Comment;
  alertThresholdSeconds: number;
  onStatusChange: (cid: string, status: { awaiting: boolean; urgent: boolean }) => void;
}

const ModQueueCountItem = ({ comment, alertThresholdSeconds, onStatusChange }: ModQueueCountItemProps) => {
  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;
  const currentTime = useCurrentTime();

  const { cid, timestamp } = displayComment;
  const isAwaiting = isPendingApprovalAwaiting(displayComment);
  const timeWaiting = currentTime - timestamp;
  const isUrgent = isAwaiting && timeWaiting > alertThresholdSeconds;

  useEffect(() => {
    onStatusChange(cid, { awaiting: isAwaiting, urgent: isUrgent });
  }, [cid, isAwaiting, isUrgent, onStatusChange]);

  return null;
};

interface ModQueueButtonContentProps {
  feed: Comment[];
  alertThresholdSeconds: number;
  boardIdentifier?: string;
  isMobile?: boolean;
}

const ModQueueButtonContent = ({ feed, alertThresholdSeconds, boardIdentifier, isMobile }: ModQueueButtonContentProps) => {
  const { t } = useTranslation();
  const [statusMap, setStatusMap] = useState<Map<string, { awaiting: boolean; urgent: boolean }>>(new Map());

  const handleStatusChange = React.useCallback((cid: string, status: { awaiting: boolean; urgent: boolean }) => {
    setStatusMap((prev) => {
      const next = new Map(prev);
      next.set(cid, status);
      return next;
    });
  }, []);

  // Clean up stale entries when comments leave the feed to prevent memory leaks
  const feedCids = useMemo(() => new Set(feed.map((item) => item.cid)), [feed]);
  useEffect(() => {
    setStatusMap((prev) => {
      const staleKeys = [...prev.keys()].filter((cid) => !feedCids.has(cid));
      if (staleKeys.length === 0) return prev;
      const next = new Map(prev);
      for (const key of staleKeys) {
        next.delete(key);
      }
      return next;
    });
  }, [feedCids]);

  const { normalCount, urgentCount } = useMemo(() => {
    let normal = 0;
    let urgent = 0;
    for (const { awaiting, urgent: isUrgent } of statusMap.values()) {
      if (awaiting) {
        if (isUrgent) urgent++;
        else normal++;
      }
    }
    return { normalCount: normal, urgentCount: urgent };
  }, [statusMap]);

  const totalCount = normalCount + urgentCount;
  const to = boardIdentifier ? `/${boardIdentifier}/mod/queue` : '/mod/queue';

  const buttonContent = (
    <button className='button'>
      <Link to={to}>
        {t('mod_queue')}
        {totalCount > 0 && (
          <strong>
            (
            {urgentCount > 0 && normalCount > 0 ? (
              <>
                <span className={styles.modQueueButtonCount}>{normalCount}</span>
                <span className={`${styles.modQueueButtonCount} ${styles.modQueueButtonCountAlert}`}>
                  {'+'}
                  {urgentCount}
                </span>
              </>
            ) : urgentCount > 0 ? (
              <span className={`${styles.modQueueButtonCount} ${styles.modQueueButtonCountAlert}`}>{urgentCount}</span>
            ) : (
              <span className={styles.modQueueButtonCount}>{totalCount}</span>
            )}
            )
          </strong>
        )}
      </Link>
    </button>
  );

  return (
    <>
      {feed.map((item) => (
        <ModQueueCountItem key={item.cid} comment={item} alertThresholdSeconds={alertThresholdSeconds} onStatusChange={handleStatusChange} />
      ))}
      {isMobile ? buttonContent : <>[{buttonContent}]</>}
    </>
  );
};

export const ModQueueButton = ({ boardIdentifier, isMobile }: ModQueueButtonProps) => {
  const { getAlertThresholdSeconds } = useModQueueStore();

  const accountCommunityAddresses = useAccountCommunityAddresses();

  const directories = useDirectories();

  const resolvedAddress = useMemo(() => {
    if (boardIdentifier) {
      return getSubplebbitAddress(boardIdentifier, directories);
    }
    return undefined;
  }, [boardIdentifier, directories]);

  const communityAddresses = useMemo(() => {
    if (resolvedAddress) {
      return [resolvedAddress];
    }
    return accountCommunityAddresses;
  }, [resolvedAddress, accountCommunityAddresses]);

  // If specific board, check if user is mod using resolved address
  const isModOfBoard = resolvedAddress ? accountCommunityAddresses.includes(resolvedAddress) : true;

  // Only fetch if we have addresses to check and permissions
  const shouldFetch = communityAddresses.length > 0 && isModOfBoard;

  const feedAddresses = shouldFetch ? communityAddresses : [];
  const feedOptions = useMemo(
    () => ({
      communityAddresses: feedAddresses,
      modQueue: ['pendingApproval'],
      sortType: 'new' as const,
      postsPerPage: 200,
    }),
    [feedAddresses],
  );
  const { feed } = useFeed(feedOptions);

  if (!shouldFetch || communityAddresses.length === 0) {
    return null;
  }

  const alertThresholdSeconds = getAlertThresholdSeconds();
  // Use key to reset statusMap state when switching boards (prevents stale counts from previous board)
  const contentKey = communityAddresses.join(',');
  return <ModQueueButtonContent key={contentKey} feed={feed} alertThresholdSeconds={alertThresholdSeconds} boardIdentifier={boardIdentifier} isMobile={isMobile} />;
};

const ModQueueView = ({ boardIdentifier: propBoardIdentifier }: ModQueueViewProps) => {
  const { t } = useTranslation();
  const params = useParams();
  const { selectedBoardFilter, viewMode } = useModQueueStore();
  const isMobile = useIsMobile();

  const accountCommunityAddresses = useAccountCommunityAddresses();

  const directories = useDirectories();

  const boardIdentifier = propBoardIdentifier || params.boardIdentifier;

  const resolvedAddress = useMemo(() => {
    if (boardIdentifier) {
      return getSubplebbitAddress(boardIdentifier, directories);
    }
    return undefined;
  }, [boardIdentifier, directories]);

  const communityAddresses = useMemo(() => {
    if (resolvedAddress) return [resolvedAddress];
    return accountCommunityAddresses;
  }, [resolvedAddress, accountCommunityAddresses]);

  const communityAddress = communityAddresses[0];
  const community = useCommunity({ communityAddress });
  const { error: communityError } = community || {};

  const feedOptions = useMemo(
    () => ({
      communityAddresses,
      modQueue: ['pendingApproval'],
      postsPerPage: 50,
    }),
    [communityAddresses],
  );
  const { feed, hasMore, loadMore, reset } = useFeed(feedOptions);

  const filteredFeed = useMemo(() => {
    if (!selectedBoardFilter) return feed;
    return feed.filter((item) => getCommentCommunityAddress(item) === selectedBoardFilter);
  }, [feed, selectedBoardFilter]);

  const addressToPathMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const addr of communityAddresses) {
      map.set(addr, getBoardPath(addr, directories));
    }
    return map;
  }, [communityAddresses, directories]);

  const showBoardColumn = !resolvedAddress;
  const compactRowItemContent = useCallback(
    (index: number, comment: Comment) => {
      const commentCommunityAddress = getCommentCommunityAddress(comment);
      const path = addressToPathMap.get(commentCommunityAddress || '') ?? (commentCommunityAddress ? getBoardPath(commentCommunityAddress, directories) : undefined);
      return (
        <ModQueueRow
          key={comment.cid}
          comment={comment}
          isOdd={index % 2 === 0}
          showBoard={showBoardColumn}
          boardPath={path}
          boardDisplayPath={path && commentCommunityAddress ? getBoardDisplayPath(commentCommunityAddress, path) : undefined}
        />
      );
    },
    [addressToPathMap, showBoardColumn, directories],
  );
  const compactCardItemContent = useCallback(
    (_index: number, comment: Comment) => {
      const commentCommunityAddress = getCommentCommunityAddress(comment);
      const path = addressToPathMap.get(commentCommunityAddress || '') ?? (commentCommunityAddress ? getBoardPath(commentCommunityAddress, directories) : undefined);
      return (
        <ModQueueCard
          key={comment.cid}
          comment={comment}
          showBoard={showBoardColumn}
          boardPath={path}
          boardDisplayPath={path && commentCommunityAddress ? getBoardDisplayPath(commentCommunityAddress, path) : undefined}
        />
      );
    },
    [addressToPathMap, showBoardColumn, directories],
  );

  const setResetFunction = useFeedResetStore((state) => state.setResetFunction);
  useEffect(() => {
    setResetFunction(reset);
  }, [reset, setResetFunction]);

  // Memoize footer components object to preserve identity across renders (Virtuoso optimization)
  // Note: useFeedStateString is called inside ModQueueFooter to isolate re-renders from backend state changes
  const footerComponents = useMemo(
    () => ({
      Footer: () => (
        <>
          {communityError?.message && feed.length === 0 && (
            <div className={styles.error}>
              <ErrorDisplay error={communityError} />
            </div>
          )}
          <ModQueueFooter hasMore={hasMore} communityAddresses={communityAddresses} />
        </>
      ),
    }),
    [hasMore, communityAddresses, communityError, feed.length],
  );

  const pageFooter = (
    <>
      <PageFooterDesktop firstRow={<StyleOnlyFooterFirstRow />} />
      <PageFooterMobile>
        <div>
          <div className={footerStyles.mobileFooterButtons}>
            <button type='button' className='button' onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })}>
              {t('top')}
            </button>
            <button type='button' className='button' onClick={() => reset?.()}>
              {t('refresh')}
            </button>
          </div>
        </div>
      </PageFooterMobile>
    </>
  );

  return (
    <>
      <div className={styles.container}>
        {!resolvedAddress && (
          <div className={styles.controls}>
            <div className={styles.controlsLeft}>
              <ModQueueBoardSummary feed={feed} directories={directories} accountCommunityAddresses={accountCommunityAddresses} />
            </div>
          </div>
        )}

        {filteredFeed.length === 0 && !hasMore ? (
          <div className={styles.empty}>{t('queue_is_empty')}</div>
        ) : (
          <>
            {viewMode === 'compact' && !isMobile && (
              <>
                <div className={styles.tableHeader}>
                  <div className={styles.numberHeader}>No.</div>
                  {!resolvedAddress && <div className={styles.boardHeader}>{t('board')}</div>}
                  <div className={styles.excerptHeader}>{t('excerpt')}</div>
                  <div className={styles.timeHeader}>{t('submitted')}</div>
                  <div className={styles.typeHeader}>{t('type')}</div>
                  <div className={styles.imageHeader}>{t('image')}</div>
                  <div className={styles.actionsHeader}>{t('actions')}</div>
                </div>

                {hasMore ? (
                  <Virtuoso
                    useWindowScroll
                    data={filteredFeed}
                    totalCount={filteredFeed.length}
                    endReached={loadMore}
                    increaseViewportBy={{ bottom: 600, top: 600 }}
                    itemContent={compactRowItemContent}
                    components={footerComponents}
                  />
                ) : (
                  <>
                    {filteredFeed.map((comment, index) => {
                      const commentCommunityAddress = getCommentCommunityAddress(comment);
                      const path =
                        addressToPathMap.get(commentCommunityAddress || '') ?? (commentCommunityAddress ? getBoardPath(commentCommunityAddress, directories) : undefined);
                      return (
                        <ModQueueRow
                          key={comment.cid}
                          comment={comment}
                          isOdd={index % 2 === 0}
                          showBoard={showBoardColumn}
                          boardPath={path}
                          boardDisplayPath={path && commentCommunityAddress ? getBoardDisplayPath(commentCommunityAddress, path) : undefined}
                        />
                      );
                    })}
                    {communityError?.message && feed.length === 0 && (
                      <div className={styles.error}>
                        <ErrorDisplay error={communityError} />
                      </div>
                    )}
                    <ModQueueFooter hasMore={hasMore} communityAddresses={communityAddresses} />
                  </>
                )}
              </>
            )}

            {viewMode === 'compact' && isMobile && (
              <>
                {hasMore ? (
                  <Virtuoso
                    useWindowScroll
                    data={filteredFeed}
                    totalCount={filteredFeed.length}
                    endReached={loadMore}
                    increaseViewportBy={{ bottom: 600, top: 600 }}
                    itemContent={compactCardItemContent}
                    components={footerComponents}
                  />
                ) : (
                  <>
                    {filteredFeed.map((comment) => {
                      const commentCommunityAddress = getCommentCommunityAddress(comment);
                      const path =
                        addressToPathMap.get(commentCommunityAddress || '') ?? (commentCommunityAddress ? getBoardPath(commentCommunityAddress, directories) : undefined);
                      return (
                        <ModQueueCard
                          key={comment.cid}
                          comment={comment}
                          showBoard={showBoardColumn}
                          boardPath={path}
                          boardDisplayPath={path && commentCommunityAddress ? getBoardDisplayPath(commentCommunityAddress, path) : undefined}
                        />
                      );
                    })}
                    {communityError?.message && feed.length === 0 && (
                      <div className={styles.error}>
                        <ErrorDisplay error={communityError} />
                      </div>
                    )}
                    <ModQueueFooter hasMore={hasMore} communityAddresses={communityAddresses} />
                  </>
                )}
              </>
            )}

            {viewMode === 'feed' && (
              <>
                {hasMore ? (
                  <Virtuoso
                    useWindowScroll
                    data={filteredFeed}
                    totalCount={filteredFeed.length}
                    endReached={loadMore}
                    increaseViewportBy={{ bottom: 600, top: 600 }}
                    itemContent={(_index, comment) => <ModQueueFeedPost key={comment.cid} comment={comment} />}
                    components={footerComponents}
                  />
                ) : (
                  <>
                    {filteredFeed.map((comment) => (
                      <ModQueueFeedPost key={comment.cid} comment={comment} />
                    ))}
                    {communityError?.message && feed.length === 0 && (
                      <div className={styles.error}>
                        <ErrorDisplay error={communityError} />
                      </div>
                    )}
                    <ModQueueFooter hasMore={hasMore} communityAddresses={communityAddresses} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      {pageFooter}
    </>
  );
};

export default ModQueueView;
