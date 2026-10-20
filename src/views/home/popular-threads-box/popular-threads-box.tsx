import { Suspense, memo, use, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Comment, useAccount, useCommunities } from '@bitsocial/bitsocial-react-hooks';
import styles from '../home.module.css';
import usePopularPosts, { getRevealedPopularPosts } from '../../../hooks/use-popular-posts';
import { useFeedStateString } from '../../../hooks/use-state-string';
import usePopularThreadsOptionsStore from '../../../stores/use-popular-threads-options-store';
import useStatsProvidersStore from '../../../stores/use-stats-providers-store';
import { getProviderPopularPosts, getStatsProviderSnapshot } from '../../../lib/stats-provider-snapshot';
import { verifyProviderThread } from '../../../lib/stats-provider-verification';
import { getCommentMediaInfo } from '../../../lib/utils/media-utils';
import { CatalogPostMedia } from '../../../components/catalog-row';
import LoadingEllipsis from '../../../components/loading-ellipsis';
import BoxModal from '../box-modal';
import { DirectoryCommunity, findDirectoryByAddress } from '../../../hooks/use-directories';
import { useCommunityIdentifiers } from '../../../hooks/use-community-identifiers';
import { getCommentCommunityAddress } from '../../../lib/utils/comment-utils';
import { getBoardPath } from '../../../lib/utils/route-utils';
import usePrefetchIntent from '../../../hooks/use-prefetch-intent';
import { CATALOG_PREVIEW_MARKDOWN_OPTIONS, removeMarkdown } from '../../../lib/utils/post-utils';

interface PopularThreadProps {
  post: Comment;
  boardTitle: string;
  boardPath: string;
}

const PopularThreadsLoading = ({ boardAddresses }: { boardAddresses: string[] }) => {
  const { t } = useTranslation();
  const loadingStateString = useFeedStateString(boardAddresses) || t('loading');

  return <LoadingEllipsis string={loadingStateString} />;
};

const ContentPreview = ({ content, maxLength = 99 }: { content: string; maxLength?: number }) => {
  const plainText = removeMarkdown(content, CATALOG_PREVIEW_MARKDOWN_OPTIONS).trim().replaceAll('&nbsp;', '').replace(/\n\n/g, '\n').replaceAll('\n\n', '');
  const truncatedText = plainText.length > maxLength ? `${plainText.substring(0, maxLength).trim()}...` : plainText;

  return truncatedText;
};

const PopularThreadCard = memo(
  ({ post, boardTitle, boardPath }: PopularThreadProps) => {
    const { cid, content, link, linkHeight, linkWidth, thumbnailUrl, title } = post || {};
    const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
    const prefetchThread = usePrefetchIntent({ commentCid: cid, communityAddress: getCommentCommunityAddress(post) });

    return (
      <div className={styles.popularThread} key={cid}>
        <div className={styles.title}>{boardTitle}</div>
        <div className={styles.mediaContainer}>
          <Link to={`/${boardPath}/thread/${cid}`} {...prefetchThread}>
            <CatalogPostMedia commentMediaInfo={commentMediaInfo} isOutOfFeed={true} cid={cid} linkWidth={linkWidth} linkHeight={linkHeight} />
          </Link>
        </div>
        <div className={styles.threadContent}>
          {title && (
            <>
              <b>{title.trim()}</b>
              {content && ': '}
            </>
          )}
          {content && <ContentPreview content={content} maxLength={99} />}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.post?.cid === nextProps.post?.cid && prevProps.boardTitle === nextProps.boardTitle && prevProps.boardPath === nextProps.boardPath,
);

const getPopularThreadBoardTitle = (directoryTitle: string | undefined): string => directoryTitle?.replace(/^\/[^/]+\/\s*-\s*/, '').replace(/\s+Directory$/, '') || '';

interface PopularThreadsSourceProps {
  boardAddresses: string[];
  directories: DirectoryCommunity[];
}

const PopularThreadsLoadingContent = ({ children }: { children: ReactNode }) => (
  <div className={`${styles.boxContent} ${styles.popularThreads} ${styles.popularThreadsLoading}`}>{children}</div>
);

const PopularThreadsList = ({ directories, posts }: { directories: DirectoryCommunity[]; posts: Comment[] }) => (
  <div className={`${styles.boxContent} ${styles.popularThreads}`}>
    {posts.map((post) => {
      const communityAddress = getCommentCommunityAddress(post);
      const directoryEntry = findDirectoryByAddress(directories, communityAddress);
      const boardTitle = getPopularThreadBoardTitle(directoryEntry?.title);
      const boardPath = communityAddress ? getBoardPath(communityAddress, directories) : '';
      return <PopularThreadCard key={post.cid} post={post} boardTitle={boardTitle} boardPath={boardPath} />;
    })}
  </div>
);

/** Loads every board over P2P and ranks their threads in the browser: the fallback when no stats provider answers. */
const P2PPopularThreads = ({ boardAddresses, directories }: PopularThreadsSourceProps) => {
  const revealedPopularPosts = getRevealedPopularPosts(boardAddresses);
  const shouldLoadPopularPosts = !revealedPopularPosts;
  const directoryCommunities = useCommunityIdentifiers(shouldLoadPopularPosts ? boardAddresses : []);
  const { communities } = useCommunities({ communities: directoryCommunities });

  const { popularPosts, isLoading } = usePopularPosts(shouldLoadPopularPosts ? communities : [], boardAddresses);

  if (isLoading) {
    return (
      <PopularThreadsLoadingContent>
        <PopularThreadsLoading boardAddresses={boardAddresses} />
      </PopularThreadsLoadingContent>
    );
  }
  return <PopularThreadsList directories={directories} posts={popularPosts} />;
};

/** Ranks the threads a stats provider sent, so the box does not wait for every board to load. */
const ProviderPopularThreads = ({ boardAddresses, directories }: PopularThreadsSourceProps) => {
  const { t } = useTranslation();
  const account = useAccount();
  // Directory addresses are never empty, so the identifiers line up with the addresses.
  const communityIdentifiers = useCommunityIdentifiers(boardAddresses);
  const boardRefs = useMemo(
    () => boardAddresses.map((address, index) => ({ address, publicKey: communityIdentifiers[index]?.publicKey })),
    [boardAddresses, communityIdentifiers],
  );
  const snapshot = use(getStatsProviderSnapshot());

  // Verifying a thread uses the account's pkc instance, which exists once accounts have loaded.
  if (snapshot && !account) {
    return (
      <PopularThreadsLoadingContent>
        <LoadingEllipsis string={t('loading')} />
      </PopularThreadsLoadingContent>
    );
  }
  const posts = snapshot ? use(getProviderPopularPosts(snapshot, boardRefs, verifyProviderThread)) : [];

  if (posts.length === 0) {
    return <P2PPopularThreads boardAddresses={boardAddresses} directories={directories} />;
  }
  return <PopularThreadsList directories={directories} posts={posts} />;
};

const PopularThreadsBox = ({ directories, directoryAddresses }: { directories: DirectoryCommunity[]; directoryAddresses: string[] }) => {
  const { t } = useTranslation();
  const showWorksafeContentOnly = usePopularThreadsOptionsStore((state) => state.showWorksafeContentOnly);
  const showNsfwContentOnly = usePopularThreadsOptionsStore((state) => state.showNsfwContentOnly);
  const usePureP2PStats = useStatsProvidersStore((state) => state.usePureP2PStats);

  const filteredBoardAddresses = useMemo(() => {
    return directoryAddresses.flatMap((address) => {
      const directoryEntry = findDirectoryByAddress(directories, address);
      if (showWorksafeContentOnly && directoryEntry?.nsfw) {
        return [];
      }
      if (showNsfwContentOnly && !directoryEntry?.nsfw) {
        return [];
      }

      return [address];
    });
  }, [directories, directoryAddresses, showNsfwContentOnly, showWorksafeContentOnly]);

  return (
    <div className={styles.box}>
      <div className={`${styles.boxBar} ${styles.color2ColorBar}`}>
        <h2 className='capitalize'>{t('popular_threads')}</h2>
        <BoxModal />
      </div>
      {usePureP2PStats ? (
        <P2PPopularThreads boardAddresses={filteredBoardAddresses} directories={directories} />
      ) : (
        <Suspense
          fallback={
            <PopularThreadsLoadingContent>
              <LoadingEllipsis string={t('loading')} />
            </PopularThreadsLoadingContent>
          }
        >
          <ProviderPopularThreads boardAddresses={filteredBoardAddresses} directories={directories} />
        </Suspense>
      )}
    </div>
  );
};

export default PopularThreadsBox;
