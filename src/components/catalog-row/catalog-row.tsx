import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useFloating, offset, size, Placement } from '@floating-ui/react';
import { Comment, useReplies } from '@bitsocial/bitsocial-react-hooks';
import getShortAddress from '../../lib/get-short-address';
import { shouldShowSnow } from '../../stores/use-special-theme-store';
import { getCommentGalleryMediaInfos, getCoverMediaInfo, getHasThumbnail } from '../../lib/utils/media-utils';
import { getFormattedTimeAgo } from '../../lib/utils/time-utils';
import { isAllView, isSubscriptionsView } from '../../lib/utils/view-utils';
import { findDirectoryByAddress, useDirectories } from '../../hooks/use-directories';
import { getBoardPath } from '../../lib/utils/route-utils';
import useCatalogStyleStore from '../../stores/use-catalog-style-store';
import useEditCommentPrivileges from '../../hooks/use-author-privileges';
import { useCommentMediaInfo } from '../../hooks/use-comment-media-info';
import useCountLinksInReplies from '../../hooks/use-count-links-in-replies';
import useHide from '../../hooks/use-hide';
import { usePostPageNumber } from '../../hooks/use-post-page-number';
import usePrefetchIntent from '../../hooks/use-prefetch-intent';
import usePinnedCatalogThreadsStore, { getPinnedThreadNewReplyCount } from '../../stores/use-pinned-catalog-threads-store';
import { isCommentArchived } from '../../lib/utils/comment-moderation-utils';
import { CATALOG_PREVIEW_MARKDOWN_OPTIONS, removeMarkdown } from '../../lib/utils/post-utils';
import { stripPostOptionMarkers } from '../../lib/utils/post-option-markers';
import { getDirectoryCodeForIdentifier } from '../../lib/code-tags';
import { CatalogPostMedia } from '../catalog-post-media';
import PostMenuDesktop from '../post-menu-desktop';
import PosterTrip from '../poster-trip';
import styles from './catalog-row.module.css';
import capitalize from 'lodash/capitalize';
import { selectPostMenuProps } from '../../lib/utils/post-menu-props';
import { getCommentCommunityAddress, withResolvedCommentCommunityAddress } from '../../lib/utils/comment-utils';
import { getAuthorBadge } from '../../lib/utils/author-display-utils';
import { hasTripcodeProof, stripTripcodeProof } from '../../lib/utils/tripcode-utils';

interface CatalogPostPreviewProps {
  post: Comment;
  visible: boolean;
  showCommunityAddress: boolean;
  floatingRef: (node: HTMLElement | null) => void;
  floatingStyles: React.CSSProperties;
}

const CatalogPostPreview = ({ post, visible, showCommunityAddress, floatingRef, floatingStyles }: CatalogPostPreviewProps) => {
  const { t } = useTranslation();
  const { author, communityAddress, replyCount, timestamp, title } = post;
  const { replies } = useReplies({ comment: post, flat: true });
  const lastReply = replies?.length > 0 ? replies[replies.length - 1] : null;

  const { commentAuthorRole: catalogPostAuthorRole } = useEditCommentPrivileges({
    commentAuthorAddress: author?.address,
    communityAddress: communityAddress ?? '',
  });
  const { commentAuthorRole: lastReplyAuthorRole } = useEditCommentPrivileges({
    commentAuthorAddress: lastReply?.author?.address,
    communityAddress: communityAddress ?? '',
  });
  const catalogPostAuthorBadge = getAuthorBadge({ address: author?.address, role: catalogPostAuthorRole });
  const lastReplyAuthorBadge = getAuthorBadge({ address: lastReply?.author?.address, role: lastReplyAuthorRole });
  if (!visible) return null;

  return createPortal(
    <div className={styles.postPreview} ref={floatingRef} style={floatingStyles}>
      {title ? (
        <>
          <span className={styles.postSubject}>{title} </span>
          {t('by')}
        </>
      ) : (
        t('posted_by')
      )}{' '}
      <span className={`${styles.postAuthor} ${catalogPostAuthorBadge ? styles.capcode : ''}`}>
        {stripTripcodeProof(author?.displayName)?.trim() || capitalize(t('anonymous'))}
        {hasTripcodeProof(author?.displayName) && <PosterTrip comment={post} />}
        {catalogPostAuthorBadge && <span className={catalogPostAuthorBadge.capitalizeLabel ? 'capitalize' : undefined}>{` ## ${catalogPostAuthorBadge.label}`}</span>}
      </span>
      {showCommunityAddress && communityAddress && ` to p/${getShortAddress(communityAddress)}`}
      <span className={styles.postAgo}> {getFormattedTimeAgo(timestamp)}</span>
      {replyCount > 0 && lastReply && (
        <div className={styles.postLast}>
          {t('last_reply_by')}{' '}
          <span className={`${styles.postAuthor} ${lastReplyAuthorBadge ? styles.capcode : ''}`}>
            {stripTripcodeProof(lastReply?.author?.displayName)?.trim() || capitalize(t('anonymous'))}
            {hasTripcodeProof(lastReply?.author?.displayName) && <PosterTrip comment={lastReply} />}
            {lastReplyAuthorBadge && <span className={lastReplyAuthorBadge.capitalizeLabel ? 'capitalize' : undefined}>{` ## ${lastReplyAuthorBadge.label}`}</span>}
          </span>
          <span className={styles.postAgo}> {getFormattedTimeAgo(lastReply?.timestamp)}</span>
        </div>
      )}
    </div>,
    document.body,
  );
};

// Like 4chan, a pinned thread's meta line also shows its board page. Only pinned threads resolve it.
const PinnedThreadPage = ({ cid, communityAddress }: { cid: string; communityAddress: string | undefined }) => {
  const page = usePostPageNumber({ communityAddress, postCid: cid });
  if (page === undefined) return null;
  return (
    <span>
      {' '}
      / P: <b>{page}</b>
    </span>
  );
};

// Memoize CatalogPost to prevent rerenders when parent rerenders due to updatingState
const CatalogPost = memo(
  ({
    matchedFilterColor,
    post,
    showHiddenPost = false,
    showPinnedThreads = false,
  }: {
    matchedFilterColor?: string;
    post: Comment;
    showHiddenPost?: boolean;
    showPinnedThreads?: boolean;
  }) => {
    const { t } = useTranslation();
    const resolvedPost = useMemo(() => withResolvedCommentCommunityAddress(post), [post]);
    const { cid, content, link, linkHeight, linkWidth, locked, pinned, replyCount, spoiler, communityAddress, timestamp, title, thumbnailUrl } = resolvedPost || {};
    const archived = isCommentArchived(resolvedPost);
    const linkCount = useCountLinksInReplies(resolvedPost);

    const linkMediaInfo = useCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
    const commentMediaInfo = getCoverMediaInfo(linkMediaInfo, resolvedPost?.gallery);
    const isLinkCover = commentMediaInfo === linkMediaInfo;
    const hasThumbnail = getHasThumbnail(commentMediaInfo, commentMediaInfo?.url);

    const { hidden } = useHide({ cid, comment: resolvedPost });
    const shouldMaskPost = hidden && !showHiddenPost;
    const pinnedThread = usePinnedCatalogThreadsStore((state) => (cid ? state.pinnedThreads[cid] : undefined));
    // Only the catalog marks pins; its hidden threads list shows threads as they are, like 4chan's hidden mode.
    const isPinned = Boolean(pinnedThread) && showPinnedThreads && !showHiddenPost;
    const newReplyCount = pinnedThread ? getPinnedThreadNewReplyCount(pinnedThread, replyCount) : 0;

    const location = useLocation();
    const params = useParams();
    const isInAllView = isAllView(location.pathname);
    const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
    const directories = useDirectories();
    const directoryEntry = findDirectoryByAddress(directories, communityAddress);
    const teaserContent = content && stripPostOptionMarkers(content, { directoryCode: getDirectoryCodeForIdentifier(communityAddress, directories), timestamp });
    const requirePostLinkIsMedia = directoryEntry?.features?.requirePostLinkIsMedia === true;
    const boardPath = communityAddress ? getBoardPath(communityAddress, directories) : '';
    const postMenuProps = useMemo(() => selectPostMenuProps(resolvedPost), [resolvedPost]);

    const postLink = boardPath ? `/${boardPath}/thread/${cid}` : `/thread/${cid}`;
    const prefetchThread = usePrefetchIntent({ commentCid: cid, communityAddress });

    const threadIcons = (
      <div className={styles.threadIcons}>
        {pinned && <span className={styles.stickyIcon} title={t('sticky')} />}
        {locked && <span className={styles.closedIcon} title={t('closed')} />}
        {archived && <span className={styles.archivedIcon} title={t('archived')} />}
      </div>
    );

    const [hoveredCid, setHoveredCid] = useState<string | null>(null);
    const [showPortal, setShowPortal] = useState<boolean>(false);
    const placementRef = useRef<Placement>('right-start');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const { refs, floatingStyles, update } = useFloating({
      open: showPortal,
      placement: placementRef.current,
      middleware: [
        offset({ mainAxis: 5 }),
        size({
          apply({ elements }) {
            const referenceElement = refs.reference.current;
            if (referenceElement) {
              const availableWidthToTheRight = window.innerWidth - (referenceElement.getBoundingClientRect().left + referenceElement.getBoundingClientRect().width);
              const availableWidthToTheLeft = referenceElement.getBoundingClientRect().left;
              const minWidth = window.innerWidth * 0.25;

              if (availableWidthToTheRight >= minWidth) {
                placementRef.current = 'right-start';
                elements.floating.style.maxWidth = `${availableWidthToTheRight - 40}px`;
              } else if (availableWidthToTheLeft >= minWidth) {
                placementRef.current = 'left-start';
                elements.floating.style.maxWidth = `${availableWidthToTheLeft - 25}px`;
              } else if (availableWidthToTheRight > availableWidthToTheLeft) {
                placementRef.current = 'right-start';
                elements.floating.style.maxWidth = `${availableWidthToTheRight - 40}px`;
              } else {
                placementRef.current = 'left-start';
                elements.floating.style.maxWidth = `${availableWidthToTheLeft - 25}px`;
              }
            }
          },
        }),
      ],
    });

    useEffect(() => {
      if (showPortal) update();
    }, [showPortal, update]);

    const postContent = (
      <div className={`${styles.teaser} ${shouldMaskPost && styles.hidden}`}>
        {shouldMaskPost ? (
          <b>({t('hidden')})</b>
        ) : (
          <>
            {title && (
              <span>
                <b>{title}</b>
                {teaserContent ? ': ' : ''}
              </span>
            )}
            {teaserContent && removeMarkdown(teaserContent, CATALOG_PREVIEW_MARKDOWN_OPTIONS)}
          </>
        )}
      </div>
    );

    const imageSize = useCatalogStyleStore((state) => state.imageSize);
    const showOPComment = useCatalogStyleStore((state) => state.showOPComment);
    const maxWidth = imageSize === 'Large' ? '250px' : '150px';
    const maxHeight = imageSize === 'Large' ? '250px' : '150px';
    const CSSProperties = {
      '--maxWidth': maxWidth,
      '--maxHeight': maxHeight,
    } as React.CSSProperties;

    const isTextOnlyThread = !hasThumbnail;

    return (
      <>
        <div className={`${styles.post} ${imageSize === 'Large' ? styles.large : ''}`} style={CSSProperties}>
          <div
            onMouseOver={() => {
              setHoveredCid(cid);
              prefetchThread.onMouseEnter?.();
            }}
            onFocus={() => {
              setHoveredCid(cid);
              prefetchThread.onFocus?.();
            }}
            onMouseLeave={() => {
              setHoveredCid(null);
              prefetchThread.onMouseLeave?.();
            }}
            onBlur={() => {
              setHoveredCid(null);
              prefetchThread.onBlur?.();
            }}
          >
            {shouldMaskPost ? (
              <Link to={postLink}>
                <span className={styles.hiddenThumbnail} />
              </Link>
            ) : hasThumbnail ? (
              <>
                {shouldShowSnow() && hasThumbnail && <img src='assets/xmashat.gif' className={styles.xmasHat} alt='' />}
                <Link
                  to={postLink}
                  onMouseOver={() => (timeoutRef.current = setTimeout(() => setShowPortal(true), 250))}
                  onFocus={() => (timeoutRef.current = setTimeout(() => setShowPortal(true), 250))}
                  onMouseLeave={() => {
                    setShowPortal(false);
                    if (timeoutRef.current) {
                      clearTimeout(timeoutRef.current);
                      timeoutRef.current = null;
                    }
                  }}
                  onBlur={() => {
                    setShowPortal(false);
                    if (timeoutRef.current) {
                      clearTimeout(timeoutRef.current);
                      timeoutRef.current = null;
                    }
                  }}
                >
                  <div className={`${styles.mediaPaddingWrapper} ${shouldMaskPost && styles.hidden}`} ref={refs.setReference}>
                    {threadIcons}
                    {spoiler ? (
                      <img src='assets/spoiler.png' alt='' className={isPinned ? styles.pinned : undefined} />
                    ) : (
                      <CatalogPostMedia
                        cid={cid}
                        commentMediaInfo={commentMediaInfo}
                        linkWidth={isLinkCover ? linkWidth : commentMediaInfo?.linkWidth}
                        linkHeight={isLinkCover ? linkHeight : commentMediaInfo?.linkHeight}
                        matchedFilterColor={matchedFilterColor}
                        pinned={isPinned}
                      />
                    )}
                  </div>
                </Link>
              </>
            ) : (
              threadIcons
            )}
            <div className={styles.meta} title={`${requirePostLinkIsMedia ? '(R)eplies / (I)mage Replies' : '(R)eplies / (L)ink Replies'}${isPinned ? ' / (P)age' : ''}`}>
              R: <b>{replyCount || '0'}</b>
              {/* 4chan writes the zero count without a space. */}
              {isPinned && (newReplyCount > 0 ? ` (+${newReplyCount})` : '(+0)')}
              {linkCount > 0 && (
                <span>
                  {' '}
                  / {requirePostLinkIsMedia ? 'I' : 'L'}: <b>{linkCount}</b>
                </span>
              )}
              {isPinned && cid && <PinnedThreadPage cid={cid} communityAddress={communityAddress} />}
              <span className={`${styles.postMenu} ${hoveredCid && styles.postMenuVisible}`}>
                <PostMenuDesktop postMenu={postMenuProps} />
              </span>
            </div>
            <div className={styles.postContent}>{(showOPComment || isTextOnlyThread) && (hasThumbnail ? postContent : <Link to={postLink}>{postContent}</Link>)}</div>
          </div>
        </div>
        {showPortal && (
          <CatalogPostPreview
            post={resolvedPost}
            visible={hoveredCid === cid}
            showCommunityAddress={isInAllView || isInSubscriptionsView}
            floatingRef={refs.setFloating}
            floatingStyles={floatingStyles}
          />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    const prev = prevProps.post;
    const next = nextProps.post;
    const prevCommunityAddress = getCommentCommunityAddress(prev);
    const nextCommunityAddress = getCommentCommunityAddress(next);
    // Compare all fields that affect rendering to avoid stale displays
    return (
      prev?.cid === next?.cid &&
      prev?.replyCount === next?.replyCount &&
      prev?.locked === next?.locked &&
      prev?.pinned === next?.pinned &&
      isCommentArchived(prev) === isCommentArchived(next) &&
      prev?.title === next?.title &&
      prev?.content === next?.content &&
      prev?.spoiler === next?.spoiler &&
      prev?.timestamp === next?.timestamp &&
      prev?.author?.displayName === next?.author?.displayName &&
      prev?.author?.address === next?.author?.address &&
      prev?.link === next?.link &&
      getCommentGalleryMediaInfos(prev?.gallery) === getCommentGalleryMediaInfos(next?.gallery) &&
      prev?.thumbnailUrl === next?.thumbnailUrl &&
      prev?.linkWidth === next?.linkWidth &&
      prev?.linkHeight === next?.linkHeight &&
      prevCommunityAddress === nextCommunityAddress &&
      prevProps.matchedFilterColor === nextProps.matchedFilterColor &&
      prevProps.showHiddenPost === nextProps.showHiddenPost &&
      prevProps.showPinnedThreads === nextProps.showPinnedThreads
    );
  },
);

interface CatalogRowProps {
  estimatedHeight?: number;
  index?: number;
  matchedFilterColors?: Map<string, string>;
  row: Comment[];
  showHiddenPosts?: boolean;
  /** Mark the viewer's pinned threads. Only the catalog does; search results show threads plainly. */
  showPinnedThreads?: boolean;
}

const CatalogRow = memo(
  ({ estimatedHeight, matchedFilterColors, row, showHiddenPosts = false, showPinnedThreads = false }: CatalogRowProps) => {
    return (
      <div className={styles.row} data-pretext-height={estimatedHeight}>
        {row.map((post, index) => (
          <CatalogPost
            key={post?.cid || index}
            matchedFilterColor={matchedFilterColors?.get(post?.cid || '')}
            post={post}
            showHiddenPost={showHiddenPosts}
            showPinnedThreads={showPinnedThreads}
          />
        ))}
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (
      prevProps.estimatedHeight !== nextProps.estimatedHeight ||
      prevProps.row.length !== nextProps.row.length ||
      prevProps.showHiddenPosts !== nextProps.showHiddenPosts ||
      prevProps.showPinnedThreads !== nextProps.showPinnedThreads
    ) {
      return false;
    }

    for (let index = 0; index < prevProps.row.length; index += 1) {
      const prevPost = prevProps.row[index];
      const nextPost = nextProps.row[index];
      if (prevPost !== nextPost) {
        return false;
      }

      const cid = prevPost?.cid || '';
      if (prevProps.matchedFilterColors?.get(cid) !== nextProps.matchedFilterColors?.get(cid)) {
        return false;
      }
    }

    return true;
  },
);

export default CatalogRow;
