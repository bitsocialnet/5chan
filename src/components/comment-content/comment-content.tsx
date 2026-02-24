import { Fragment, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Comment, useComment } from '@plebbit/plebbit-react-hooks';
import useSubplebbitsPagesStore from '@plebbit/plebbit-react-hooks/dist/stores/subplebbits-pages';
import usePostNumberStore from '../../stores/use-post-number-store';
import Plebbit from '@plebbit/plebbit-js';
import { getFormattedDate, getFormattedTimeAgo } from '../../lib/utils/time-utils';
import { isPostPageView } from '../../lib/utils/view-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import useStateString from '../../hooks/use-state-string';
import LoadingEllipsis from '../../components/loading-ellipsis';
import ReplyQuotePreview from '../../components/reply-quote-preview';
import Markdown from '../../components/markdown';
import Tooltip from '../../components/tooltip';
import styles from '../../views/post/post.module.css';
import capitalize from 'lodash/capitalize';

const QuotedCidLink = ({ cid, postCid }: { cid: string; postCid: string }) => {
  const commentFromStore = useSubplebbitsPagesStore((state) => state.comments[cid]);
  const commentFromHook = useComment({ commentCid: cid, onlyIfCached: true });
  // Prefer hook version to ensure 'number' property is populated for deeper nested replies in Virtuoso
  const quotedComment = commentFromHook?.number !== undefined ? commentFromHook : commentFromStore;
  const isOP = cid === postCid;
  return <ReplyQuotePreview isQuotelinkReply={true} quotelinkReply={quotedComment} isOP={isOP} />;
};

const useScopedCidToNumber = (cids: string[]) => {
  const sortedUniqueCids = useMemo(() => {
    const uniqueCids = new Set<string>();
    for (const cid of cids) {
      if (cid) {
        uniqueCids.add(cid);
      }
    }
    return [...uniqueCids].sort();
  }, [cids]);

  const cidToNumber = usePostNumberStore((s) => s.cidToNumber);

  if (sortedUniqueCids.length === 0) {
    return {} as Record<string, number>;
  }

  const nextCidToNumber: Record<string, number> = {};
  for (const cid of sortedUniqueCids) {
    const number = cidToNumber[cid];
    if (typeof number === 'number') {
      nextCidToNumber[cid] = number;
    }
  }
  return nextCidToNumber;
};

const CommentContent = ({ comment: post }: { comment: Comment }) => {
  const { t } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const isInPostView = isPostPageView(location.pathname, params);
  const [showOriginal, setShowOriginal] = useState(false);
  const isMobile = useIsMobile();

  const { cid, content, deleted, edit, original, parentCid, postCid, pendingApproval, quotedCids, reason, removed, state, subplebbitAddress } = post || {};
  const banned = !!post?.author?.subplebbit?.banExpiresAt;

  const [showFullComment, setShowFullComment] = useState(false);
  const displayContent =
    content &&
    (!isInPostView && content.length > 1000 && !showFullComment
      ? content.slice(0, 1000)
      : isInPostView && content.length > 2000 && !showFullComment
        ? content.slice(0, 2000)
        : content);

  const quotelinkReplyFromStore = useSubplebbitsPagesStore((state) => state.comments[parentCid]);
  const quotelinkReplyFromHook = useComment({ commentCid: parentCid, onlyIfCached: true });
  // Prefer hook version to ensure 'number' property is populated for deeper nested replies in Virtuoso
  const quotelinkReply = quotelinkReplyFromHook?.number !== undefined ? quotelinkReplyFromHook : quotelinkReplyFromStore;

  const isReply = !!parentCid;
  const isReplyingToReply = isReply && parentCid !== postCid;

  const contentNumbers = !content ? new Set<number>() : new Set([...content.matchAll(/(?<![>/\w])>>(\d+)(?![\d/])/g)].map((m) => parseInt(m[1], 10)));

  const relevantQuotedCids = (() => {
    const cids = quotedCids ? [...quotedCids] : [];
    if (parentCid) {
      cids.push(parentCid);
    }
    return cids;
  })();

  const cidToNumber = useScopedCidToNumber(relevantQuotedCids);
  const filteredQuotedCids = !quotedCids?.length
    ? []
    : quotedCids.filter((cid: string) => {
        const num = cidToNumber[cid];
        return num === undefined || !contentNumbers.has(num);
      });

  const shouldShowReplyingToReply = isReplyingToReply && (parentCid ? !contentNumbers.has(cidToNumber[parentCid] ?? -1) : true);

  const stateString = useStateString(post);
  const hasFailedState = state === 'failed';

  const loadingString = (
    <div className={styles.stateString}>{!hasFailedState ? <LoadingEllipsis string={stateString || t('loading')} /> : stateString || capitalize(t('failed'))}</div>
  );

  return (
    <blockquote className={`${styles.postMessage} ${!isReply && isMobile && styles.clampLines}`}>
      {isReply &&
        !hasFailedState &&
        !(deleted || removed) &&
        (filteredQuotedCids.length > 0
          ? filteredQuotedCids.map((cid: string) => <QuotedCidLink key={cid} cid={cid} postCid={postCid} />)
          : shouldShowReplyingToReply && <ReplyQuotePreview isQuotelinkReply={true} quotelinkReply={quotelinkReply} />)}
      {removed ? (
        reason ? (
          <>
            <span className={styles.redEditMessage}>({t('this_post_was_removed')})</span>
            <br />
            <br />
            <span className={styles.grayEditMessage}>{`${capitalize(t('reason'))}: "${reason}"`}</span>
          </>
        ) : (
          <span className={styles.grayEditMessage}>{capitalize(t('this_post_was_removed'))}.</span>
        )
      ) : deleted ? (
        reason ? (
          <>
            <span className={styles.grayEditMessage}>{t('user_deleted_this_post')}</span>{' '}
            <span className={styles.grayEditMessage}>{`${capitalize(t('reason'))}: "${reason}"`}</span>
          </>
        ) : (
          <span className={styles.grayEditMessage}>{t('user_deleted_this_post')}</span>
        )
      ) : (
        <>
          {!showOriginal && <Markdown content={displayContent} postCid={postCid} />}
          {pendingApproval && (
            <>
              <br />
              <span className={styles.pendingApproval}>({t('pending_mod_approval')})</span>
            </>
          )}
          {((!isInPostView && content?.length > 1000 && !showFullComment) || (isInPostView && content?.length > 2000 && !showFullComment)) && (
            <span className={styles.abbr}>
              <br />
              <br />
              <Trans
                i18nKey={'comment_too_long'}
                shouldUnescape={true}
                components={{
                  1: (
                    <span
                      key={cid}
                      role='button'
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShowFullComment(true);
                        }
                      }}
                      onClick={() => setShowFullComment(true)}
                    />
                  ),
                }}
              />
            </span>
          )}
          {edit && original?.content !== content && (
            <span className={styles.editedInfo}>
              {showOriginal && <Markdown content={original?.content} postCid={postCid} />}
              <br />
              <br />
              <Trans
                i18nKey={'comment_edited_at_timestamp'}
                values={{ timestamp: getFormattedDate(edit?.timestamp) }}
                shouldUnescape={true}
                components={{
                  1: (
                    <Tooltip key={edit?.timestamp} content={getFormattedTimeAgo(edit?.timestamp)}>
                      <Fragment key={edit?.timestamp}></Fragment>
                    </Tooltip>
                  ),
                }}
              />{' '}
              {reason && <>{t('reason_reason', { reason: reason, interpolation: { escapeValue: false } })} </>}
              {showOriginal ? (
                <Trans
                  i18nKey={'click_here_to_hide_original'}
                  shouldUnescape={true}
                  components={{
                    1: (
                      <span
                        key={cid}
                        className={styles.showOriginal}
                        role='button'
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowOriginal(!showOriginal);
                          }
                        }}
                        onClick={() => setShowOriginal(!showOriginal)}
                      />
                    ),
                  }}
                />
              ) : (
                <Trans
                  i18nKey={'click_here_to_show_original'}
                  shouldUnescape={true}
                  components={{
                    1: (
                      <span
                        key={cid}
                        className={styles.showOriginal}
                        role='button'
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowOriginal(!showOriginal);
                          }
                        }}
                        onClick={() => setShowOriginal(!showOriginal)}
                      />
                    ),
                  }}
                />
              )}
            </span>
          )}
        </>
      )}
      {banned && (
        <span className={styles.removedContent}>
          <br />
          <br />
          <Tooltip
            content={`${t('ban_expires_at', {
              address: subplebbitAddress && Plebbit.getShortAddress({ address: subplebbitAddress }),
              timestamp: getFormattedDate(post?.author?.subplebbit?.banExpiresAt),
              interpolation: { escapeValue: false },
            })}${reason ? `. ${capitalize(t('reason'))}: "${reason}"` : ''}`}
          >
            {`(${t('user_banned')})`}
          </Tooltip>
        </span>
      )}
      {!cid && !hasFailedState && (
        <>
          <br />
          <br />
          {loadingString}
        </>
      )}
    </blockquote>
  );
};

export default CommentContent;
