import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Comment, Subplebbit } from '@plebbit/plebbit-react-hooks';
import styles from '../home.module.css';
import usePopularPosts from '../../../hooks/use-popular-posts';
import usePopularThreadsOptionsStore from '../../../stores/use-popular-threads-options-store';
import { getCommentMediaInfo } from '../../../lib/utils/media-utils';
import { CatalogPostMedia } from '../../../components/catalog-row';
import LoadingEllipsis from '../../../components/loading-ellipsis';
import BoxModal from '../box-modal';
import { DirectoryCommunity } from '../../../hooks/use-directories';
import { getBoardPath } from '../../../lib/utils/route-utils';
import { removeMarkdown } from '../../../lib/utils/post-utils';

interface PopularThreadProps {
  post: Comment;
  directories: DirectoryCommunity[];
}

export const ContentPreview = ({ content, maxLength = 99 }: { content: string; maxLength?: number }) => {
  const plainText = removeMarkdown(content).trim().replaceAll('&nbsp;', '').replace(/\n\n/g, '\n').replaceAll('\n\n', '');
  const truncatedText = plainText.length > maxLength ? `${plainText.substring(0, maxLength).trim()}...` : plainText;

  return truncatedText;
};

// Memoize to prevent rerenders when parent rerenders due to updatingState
const PopularThreadCard = memo(
  ({ post, directories }: PopularThreadProps) => {
    const { cid, content, link, linkHeight, linkWidth, subplebbitAddress, thumbnailUrl, title } = post || {};
    const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);

    // Find the matching DirectoryCommunity entry and get its title
    const directoriesEntry = directories.find((ms) => ms?.address === subplebbitAddress);
    const boardTitle = directoriesEntry?.title?.replace(/^\/[^/]+\/\s*-\s*/, '') || '';
    const boardPath = subplebbitAddress ? getBoardPath(subplebbitAddress, directories) : '';

    return (
      <div className={styles.popularThread} key={cid}>
        <div className={styles.title}>{boardTitle}</div>
        <div className={styles.mediaContainer}>
          <Link to={`/${boardPath}/thread/${cid}`}>
            <CatalogPostMedia commentMediaInfo={commentMediaInfo} isOutOfFeed={true} cid={cid} />
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
  // Custom equality: rerender if post.cid or directories entry title changes
  (prevProps, nextProps) => {
    if (prevProps.post?.cid !== nextProps.post?.cid) return false;
    // Compare the relevant directories entry for this post's subplebbitAddress
    const prevEntry = prevProps.directories.find((ms) => ms?.address === prevProps.post?.subplebbitAddress);
    const nextEntry = nextProps.directories.find((ms) => ms?.address === nextProps.post?.subplebbitAddress);
    return prevEntry?.title === nextEntry?.title;
  },
);

const PopularThreadsBox = ({ directories, subplebbits }: { directories: DirectoryCommunity[]; subplebbits: any }) => {
  const { t } = useTranslation();
  const { showWorksafeContentOnly, showNsfwContentOnly } = usePopularThreadsOptionsStore();

  const getFilteredSubplebbits = () => {
    if (showWorksafeContentOnly) {
      return subplebbits.filter((sub: Subplebbit) => {
        const directoriesEntry = directories.find((ms) => ms?.address === sub?.address);
        return directoriesEntry ? !directoriesEntry.nsfw : true;
      });
    }
    if (showNsfwContentOnly) {
      return subplebbits.filter((sub: Subplebbit) => {
        const directoriesEntry = directories.find((ms) => ms?.address === sub?.address);
        return directoriesEntry ? directoriesEntry.nsfw : false;
      });
    }
    return subplebbits;
  };

  const filteredSubplebbits = useMemo(getFilteredSubplebbits, [subplebbits, showWorksafeContentOnly, showNsfwContentOnly, directories]);
  const { popularPosts } = usePopularPosts(filteredSubplebbits);
  const isLoading = popularPosts.length === 0;

  return (
    <div className={styles.box}>
      <div className={`${styles.boxBar} ${styles.color2ColorBar}`}>
        <h2 className='capitalize'>{t('popular_threads')}</h2>
        <BoxModal />
      </div>
      <div className={`${styles.boxContent} ${styles.popularThreads} ${isLoading ? styles.popularThreadsLoading : ''}`}>
        {isLoading ? (
          <LoadingEllipsis string={t('loading')} />
        ) : (
          popularPosts.map((post: any) => <PopularThreadCard key={post.cid} post={post} directories={directories} />)
        )}
      </div>
    </div>
  );
};

export default PopularThreadsBox;
