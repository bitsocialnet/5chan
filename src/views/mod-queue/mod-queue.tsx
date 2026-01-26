import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useFeed, Comment, usePublishCommentModeration, useEditedComment, useSubplebbit, useComment } from '@plebbit/plebbit-react-hooks';
import useAccountsStore from '@plebbit/plebbit-react-hooks/dist/stores/accounts';
import { Virtuoso } from 'react-virtuoso';
import { formatDistanceToNow } from 'date-fns';
import styles from './mod-queue.module.css';
import useModQueueStore from '../../stores/use-mod-queue-store';
import { useAccountSubplebbitsWithMetadata } from '../../hooks/use-account-subplebbits-with-metadata';
import LoadingEllipsis from '../../components/loading-ellipsis';
import ErrorDisplay from '../../components/error-display/error-display';
import { useFeedStateString } from '../../hooks/use-state-string';
import { getSubplebbitAddress, getBoardPath } from '../../lib/utils/route-utils';
import { useDefaultSubplebbits, MultisubSubplebbit } from '../../hooks/use-default-subplebbits';
import { useBoardPath } from '../../hooks/use-resolved-subplebbit-address';
import { getHasThumbnail, getCommentMediaInfo } from '../../lib/utils/media-utils';
import { getFormattedDate, getFormattedTimeAgo } from '../../lib/utils/time-utils';
import useFeedResetStore from '../../stores/use-feed-reset-store';
import useChallengesStore from '../../stores/use-challenges-store';
import { alertChallengeVerificationFailed } from '../../lib/utils/challenge-utils';
import Tooltip from '../../components/tooltip';
import useIsMobile from '../../hooks/use-is-mobile';
import { Post } from '../post/post';
import _ from 'lodash';

const { addChallenge } = useChallengesStore.getState();

interface ModQueueViewProps {
  boardIdentifier?: string; // If provided, shows queue for single board
}

interface ModQueueFooterProps {
  hasMore: boolean;
  subplebbitAddresses: string[];
}

// Defined outside ModQueueView to preserve component identity across renders (Virtuoso optimization)
// The useFeedStateString hook is called here instead of in ModQueueView to isolate re-renders
// caused by backend IPFS state changes to just this footer component
const ModQueueFooter = ({ hasMore, subplebbitAddresses }: ModQueueFooterProps) => {
  const { t } = useTranslation();
  const loadingStateString = useFeedStateString(subplebbitAddresses) || t('loading');

  return hasMore ? (
    <div className={styles.footer}>
      <LoadingEllipsis string={loadingStateString} />
    </div>
  ) : null;
};

interface ModQueueRowProps {
  comment: Comment;
  isOdd?: boolean;
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

const useModQueueActions = (comment: Comment): ModQueueActionState => {
  const { t } = useTranslation();
  const { cid, subplebbitAddress, approved, removed } = comment || {};
  const [initiatedAction, setInitiatedAction] = useState<ModerationAction>(null);

  const alreadyApproved = approved === true;
  const alreadyRejected = removed === true;

  const {
    publishCommentModeration: approve,
    state: approveState,
    error: approveError,
  } = usePublishCommentModeration({
    commentCid: cid,
    subplebbitAddress,
    commentModeration: { approved: true },
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
    subplebbitAddress,
    commentModeration: { removed: true },
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

const ModQueueRow = ({ comment, isOdd = false }: ModQueueRowProps) => {
  const { t } = useTranslation();
  const { getAlertThresholdSeconds } = useModQueueStore();
  const isMobile = useIsMobile();

  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;

  const { content, title, timestamp, subplebbitAddress, cid, threadCid, link, thumbnailUrl, linkWidth, linkHeight, removed, approved, number, parentCid } =
    displayComment;

  // Check if already moderated (from previous session or API update)
  // Note: `approved` and `removed` are direct fields on the comment from CommentUpdate,
  // not nested under commentModeration (which is the options object for publishing moderation actions)
  const alreadyApproved = approved === true;
  const alreadyRejected = removed === true;

  const timeWaiting = Date.now() / 1000 - timestamp;
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const isOverThreshold = timeWaiting > alertThresholdSeconds;

  // Only show alert animation for comments awaiting approval (not approved or rejected)
  const isAwaitingApproval = !alreadyApproved && !alreadyRejected;

  const { status, errorMessage, isPublishing, handleApprove, handleReject } = useModQueueActions(displayComment);

  const boardPath = useBoardPath(subplebbitAddress);
  const hasTitle = title && title.trim().length > 0;
  const hasContent = content && content.trim().length > 0;
  const hasLink = link && link.length > 0;
  const isReply = !!parentCid;
  const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);
  const rawExcerpt =
    (hasTitle && hasContent ? `${title}: ${content}` : null) ||
    (hasTitle ? title : null) ||
    (hasContent ? content : null) ||
    (hasLink ? link : null) ||
    (hasThumbnail ? t('image') : null) ||
    t('no_content');
  // Only truncate excerpt on desktop, allow wrapping on mobile
  const excerpt = !isMobile && rawExcerpt.length > 101 ? rawExcerpt.slice(0, 98) + '...' : rawExcerpt;
  const threadTargetCid = threadCid || cid;
  const postUrl = boardPath && threadTargetCid ? `/${boardPath}/thread/${threadTargetCid}` : undefined;

  // Render the status or action buttons
  const renderActions = () => {
    // Check existing moderation state first (from API/previous sessions)
    if (status === 'approved') {
      return <span className={`${styles.button} ${styles.approve}`}>{t('approved')}</span>;
    }
    if (status === 'rejected') {
      return <span className={`${styles.button} ${styles.reject}`}>{t('rejected')}</span>;
    }
    if (status === 'failed') {
      return (
        <span className={`${styles.button} ${styles.reject}`}>
          {t('failed')}
          {errorMessage ? `: ${errorMessage}` : ''}
        </span>
      );
    }
    if (isPublishing) {
      return <LoadingEllipsis string={t('publishing')} />;
    }

    return (
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
    );
  };

  return (
    <div className={`${styles.row} ${isOdd ? styles.rowOdd : ''}`}>
      <div className={styles.number}>{number ?? 'N/A'}</div>
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
            <Tooltip children={<span>{getFormattedDate(timestamp)}</span>} content={getFormattedTimeAgo(timestamp)} />
            <span className={styles.alertWrapper}>
              {' '}
              (<span className={styles.alert}>{getFormattedTimeAgo(timestamp)}</span>)
            </span>
          </>
        ) : (
          <Tooltip children={<span>{getFormattedDate(timestamp)}</span>} content={getFormattedTimeAgo(timestamp)} />
        )}
      </div>
      <div className={styles.type}>{isReply ? _.capitalize(t('reply')) : _.capitalize(t('post'))}</div>
      <div className={styles.image}>{hasThumbnail ? t('yes') : t('no')}</div>
      <div className={styles.actions}>{renderActions()}</div>
    </div>
  );
};

interface ModQueueCardProps {
  comment: Comment;
}

const ModQueueCard = ({ comment }: ModQueueCardProps) => {
  const { t } = useTranslation();
  const { getAlertThresholdSeconds } = useModQueueStore();

  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;

  const { content, title, timestamp, subplebbitAddress, cid, threadCid, link, thumbnailUrl, linkWidth, linkHeight, removed, approved, number, parentCid } =
    displayComment;

  const alreadyApproved = approved === true;
  const alreadyRejected = removed === true;

  const timeWaiting = Date.now() / 1000 - timestamp;
  const alertThresholdSeconds = getAlertThresholdSeconds();
  const isOverThreshold = timeWaiting > alertThresholdSeconds;
  const isAwaitingApproval = !alreadyApproved && !alreadyRejected;

  const { status, errorMessage, isPublishing, handleApprove, handleReject } = useModQueueActions(displayComment);

  const boardPath = useBoardPath(subplebbitAddress);
  const hasTitle = title && title.trim().length > 0;
  const hasContent = content && content.trim().length > 0;
  const hasLink = link && link.length > 0;
  const isReply = !!parentCid;
  const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, link);
  const rawExcerpt =
    (hasTitle && hasContent ? `${title}: ${content}` : null) ||
    (hasTitle ? title : null) ||
    (hasContent ? content : null) ||
    (hasLink ? link : null) ||
    (hasThumbnail ? t('image') : null) ||
    t('no_content');
  const excerpt = rawExcerpt.length > 140 ? rawExcerpt.slice(0, 137) + '...' : rawExcerpt;
  const threadTargetCid = threadCid || cid;
  const postUrl = boardPath && threadTargetCid ? `/${boardPath}/thread/${threadTargetCid}` : undefined;

  const renderActions = () => {
    if (status === 'approved') {
      return (
        <div className={styles.cardActions}>
          <span className={`${styles.button} ${styles.approve}`}>{t('approved')}</span>
        </div>
      );
    }
    if (status === 'rejected') {
      return (
        <div className={styles.cardActions}>
          <span className={`${styles.button} ${styles.reject}`}>{t('rejected')}</span>
        </div>
      );
    }
    if (status === 'failed') {
      return (
        <div className={styles.cardActions}>
          <span className={`${styles.button} ${styles.reject}`}>
            {t('failed')}
            {errorMessage ? `: ${errorMessage}` : ''}
          </span>
        </div>
      );
    }
    if (isPublishing) {
      return (
        <div className={styles.cardActions}>
          <LoadingEllipsis string={t('publishing')} />
        </div>
      );
    }

    return (
      <div className={styles.cardActions}>
        <button className={styles.button} onClick={handleApprove} disabled={isPublishing}>
          {t('approve')}
        </button>
        <button className={styles.button} onClick={handleReject} disabled={isPublishing}>
          {t('reject')}
        </button>
      </div>
    );
  };

  return (
    <div className={styles.mobileCard}>
      <div className={styles.cardHeader}>
        <span className={styles.cardNumber}>No. {number ?? 'N/A'}</span>
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
        / {t('type')}: {isReply ? t('reply') : t('post')} / {_.capitalize(t('image'))}: {hasThumbnail ? _.lowerCase(t('yes')) : _.lowerCase(t('no'))}
      </div>
      {renderActions()}
    </div>
  );
};

const ModQueueFeedPost = ({ comment }: { comment: Comment }) => {
  const { editedComment } = useEditedComment({ comment });
  const displayComment = editedComment || comment;
  const { status, errorMessage, isPublishing, handleApprove, handleReject } = useModQueueActions(displayComment);
  const { parentCid } = displayComment;

  // Fetch parent comment if this is a reply
  const parentComment = useComment({ commentCid: parentCid });

  return (
    <>
      {parentCid && parentComment && (
        <div style={{ marginBottom: '10px', paddingLeft: '20px', borderLeft: '2px solid var(--mod-queue-alert-color, #ccc)' }}>
          <Post post={parentComment} showAllReplies={false} showReplies={false} isModQueue={false} />
        </div>
      )}
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
    </>
  );
};

interface ModQueueBoardFilterProps {
  subplebbits: MultisubSubplebbit[];
}

const ModQueueBoardFilter = ({ subplebbits }: ModQueueBoardFilterProps) => {
  const { t } = useTranslation();
  const { selectedBoardFilter, setSelectedBoardFilter } = useModQueueStore();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedBoardFilter(value);
  };

  if (!subplebbits || subplebbits.length === 0) {
    return null;
  }

  // Default to first board if none selected
  const firstBoardAddress = subplebbits.find((sub) => sub.address)?.address;
  const currentFilter = selectedBoardFilter || firstBoardAddress || '';

  // Auto-select first board if none is selected
  useEffect(() => {
    if (!selectedBoardFilter && firstBoardAddress) {
      setSelectedBoardFilter(firstBoardAddress);
    }
  }, [selectedBoardFilter, firstBoardAddress, setSelectedBoardFilter]);

  return (
    <div className={styles.filterContainer}>
      <label>{t('filter_by_board')}:</label>
      <select value={currentFilter} onChange={handleChange}>
        {subplebbits.map((sub) => {
          const address = sub.address;
          if (!address) return null;
          return (
            <option key={address} value={address}>
              /{getBoardPath(address, subplebbits)}/
            </option>
          );
        })}
      </select>
    </div>
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

  const { cid, approved, removed, timestamp } = displayComment;
  const isAwaiting = approved !== true && removed !== true;
  const timeWaiting = Date.now() / 1000 - timestamp;
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
  const to = boardIdentifier ? `/${boardIdentifier}/queue` : '/mod/queue';

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

  const accountSubplebbitAddresses = useAccountsStore(
    (state) => {
      const activeAccountId = state.activeAccountId;
      const activeAccount = activeAccountId ? state.accounts[activeAccountId] : undefined;
      const accountSubplebbits = activeAccount?.subplebbits || {};
      return Object.keys(accountSubplebbits);
    },
    (prev, next) => {
      if (prev.length !== next.length) return false;
      return prev.every((val, idx) => val === next[idx]);
    },
  );

  const defaultSubplebbits = useDefaultSubplebbits();

  const resolvedAddress = useMemo(() => {
    if (boardIdentifier) {
      return getSubplebbitAddress(boardIdentifier, defaultSubplebbits);
    }
    return undefined;
  }, [boardIdentifier, defaultSubplebbits]);

  const subplebbitAddresses = useMemo(() => {
    if (resolvedAddress) {
      return [resolvedAddress];
    }
    return accountSubplebbitAddresses;
  }, [resolvedAddress, accountSubplebbitAddresses]);

  // If specific board, check if user is mod using resolved address
  const isModOfBoard = resolvedAddress ? accountSubplebbitAddresses.includes(resolvedAddress) : true;

  // Only fetch if we have addresses to check and permissions
  const shouldFetch = subplebbitAddresses.length > 0 && isModOfBoard;

  const { feed } = useFeed({
    subplebbitAddresses: shouldFetch ? subplebbitAddresses : [],
    modQueue: ['pendingApproval'],
    sortType: 'new',
    postsPerPage: 200, // Fetch more items to get accurate pending count for the badge
  });

  if (!shouldFetch || subplebbitAddresses.length === 0) {
    return null;
  }

  const alertThresholdSeconds = getAlertThresholdSeconds();
  // Use key to reset statusMap state when switching boards (prevents stale counts from previous board)
  const contentKey = subplebbitAddresses.join(',');
  return <ModQueueButtonContent key={contentKey} feed={feed} alertThresholdSeconds={alertThresholdSeconds} boardIdentifier={boardIdentifier} isMobile={isMobile} />;
};

export const ModQueueView = ({ boardIdentifier: propBoardIdentifier }: ModQueueViewProps) => {
  const { t } = useTranslation();
  const params = useParams();
  const { selectedBoardFilter, viewMode } = useModQueueStore();
  const isMobile = useIsMobile();

  const accountSubplebbitAddresses = useAccountsStore(
    (state) => {
      const activeAccountId = state.activeAccountId;
      const activeAccount = activeAccountId ? state.accounts[activeAccountId] : undefined;
      const accountSubplebbits = activeAccount?.subplebbits || {};
      return Object.keys(accountSubplebbits);
    },
    (prev, next) => {
      if (prev.length !== next.length) return false;
      return prev.every((val, idx) => val === next[idx]);
    },
  );

  const defaultSubplebbits = useDefaultSubplebbits();

  const boardIdentifier = propBoardIdentifier || params.boardIdentifier;

  const resolvedAddress = useMemo(() => {
    if (boardIdentifier) {
      return getSubplebbitAddress(boardIdentifier, defaultSubplebbits);
    }
    return undefined;
  }, [boardIdentifier, defaultSubplebbits]);

  const subplebbitsWithMetadata = useAccountSubplebbitsWithMetadata();

  const subplebbitAddresses = useMemo(() => {
    if (resolvedAddress) {
      return [resolvedAddress];
    }

    // Always require a board filter when viewing /mod/queue (no boardIdentifier)
    if (selectedBoardFilter) {
      return [selectedBoardFilter];
    }

    // Default to first board if none selected
    const firstBoardAddress = accountSubplebbitAddresses[0];
    if (firstBoardAddress) {
      return [firstBoardAddress];
    }

    return [];
  }, [resolvedAddress, selectedBoardFilter, accountSubplebbitAddresses]);

  const subplebbitAddress = subplebbitAddresses[0];
  const subplebbit = useSubplebbit({ subplebbitAddress });
  const { error: subplebbitError } = subplebbit || {};

  const { feed, hasMore, loadMore, reset } = useFeed({
    subplebbitAddresses,
    modQueue: ['pendingApproval'],
    postsPerPage: 50,
  });

  // Register reset function with feed reset store so refresh button works
  const setResetFunction = useFeedResetStore((state) => state.setResetFunction);
  useEffect(() => {
    setResetFunction(reset);
  }, [reset, setResetFunction]);

  // Auto-select first board if viewing /mod/queue without a boardIdentifier and no filter is set
  useEffect(() => {
    if (!resolvedAddress && !selectedBoardFilter && accountSubplebbitAddresses.length > 0) {
      const { setSelectedBoardFilter } = useModQueueStore.getState();
      setSelectedBoardFilter(accountSubplebbitAddresses[0]);
    }
  }, [resolvedAddress, selectedBoardFilter, accountSubplebbitAddresses]);

  // Memoize footer components object to preserve identity across renders (Virtuoso optimization)
  // Note: useFeedStateString is called inside ModQueueFooter to isolate re-renders from backend state changes
  const footerComponents = useMemo(
    () => ({
      Footer: () => (
        <>
          {subplebbitError?.message && feed.length === 0 && (
            <div className={styles.error}>
              <ErrorDisplay error={subplebbitError} />
            </div>
          )}
          <ModQueueFooter hasMore={hasMore} subplebbitAddresses={subplebbitAddresses} />
        </>
      ),
    }),
    [hasMore, subplebbitAddresses, subplebbitError, feed.length],
  );

  return (
    <div className={styles.container}>
      {!resolvedAddress && (
        <div className={styles.controls}>
          <div className={styles.controlsLeft}>
            <ModQueueBoardFilter subplebbits={subplebbitsWithMetadata} />
          </div>
        </div>
      )}

      {feed.length === 0 && !hasMore ? (
        <div className={styles.empty}>{t('queue_is_empty')}</div>
      ) : (
        <>
          {viewMode === 'compact' && !isMobile && (
            <>
              <div className={styles.tableHeader}>
                <div className={styles.numberHeader}>No.</div>
                <div className={styles.excerptHeader}>{t('excerpt')}</div>
                <div className={styles.timeHeader}>{t('submitted')}</div>
                <div className={styles.typeHeader}>{t('type')}</div>
                <div className={styles.imageHeader}>{t('image')}</div>
                <div className={styles.actionsHeader}>{t('actions')}</div>
              </div>

              {hasMore ? (
                <Virtuoso
                  useWindowScroll
                  data={feed}
                  totalCount={feed.length}
                  endReached={loadMore}
                  increaseViewportBy={{ bottom: 1200, top: 1200 }}
                  itemContent={(index, comment) => <ModQueueRow key={comment.cid} comment={comment} isOdd={index % 2 === 0} />}
                  components={footerComponents}
                />
              ) : (
                <>
                  {feed.map((comment, index) => (
                    <ModQueueRow key={comment.cid} comment={comment} isOdd={index % 2 === 0} />
                  ))}
                  {subplebbitError?.message && feed.length === 0 && (
                    <div className={styles.error}>
                      <ErrorDisplay error={subplebbitError} />
                    </div>
                  )}
                  <ModQueueFooter hasMore={hasMore} subplebbitAddresses={subplebbitAddresses} />
                </>
              )}
            </>
          )}

          {viewMode === 'compact' && isMobile && (
            <>
              {hasMore ? (
                <Virtuoso
                  useWindowScroll
                  data={feed}
                  totalCount={feed.length}
                  endReached={loadMore}
                  increaseViewportBy={{ bottom: 1200, top: 1200 }}
                  itemContent={(_index, comment) => <ModQueueCard key={comment.cid} comment={comment} />}
                  components={footerComponents}
                />
              ) : (
                <>
                  {feed.map((comment) => (
                    <ModQueueCard key={comment.cid} comment={comment} />
                  ))}
                  {subplebbitError?.message && feed.length === 0 && (
                    <div className={styles.error}>
                      <ErrorDisplay error={subplebbitError} />
                    </div>
                  )}
                  <ModQueueFooter hasMore={hasMore} subplebbitAddresses={subplebbitAddresses} />
                </>
              )}
            </>
          )}

          {viewMode === 'feed' && (
            <>
              {hasMore ? (
                <Virtuoso
                  useWindowScroll
                  data={feed}
                  totalCount={feed.length}
                  endReached={loadMore}
                  increaseViewportBy={{ bottom: 1200, top: 1200 }}
                  itemContent={(_index, comment) => <ModQueueFeedPost key={comment.cid} comment={comment} />}
                  components={footerComponents}
                />
              ) : (
                <>
                  {feed.map((comment) => (
                    <ModQueueFeedPost key={comment.cid} comment={comment} />
                  ))}
                  {subplebbitError?.message && feed.length === 0 && (
                    <div className={styles.error}>
                      <ErrorDisplay error={subplebbitError} />
                    </div>
                  )}
                  <ModQueueFooter hasMore={hasMore} subplebbitAddresses={subplebbitAddresses} />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ModQueueView;
