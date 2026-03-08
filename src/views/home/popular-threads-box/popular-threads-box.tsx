import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Comment, Subplebbit } from '@bitsocialhq/bitsocial-react-hooks';
import styles from '../home.module.css';
import usePopularPosts from '../../../hooks/use-popular-posts';
import usePopularThreadsOptionsStore from '../../../stores/use-popular-threads-options-store';
import { getCommentMediaInfo } from '../../../lib/utils/media-utils';
import { CatalogPostMedia } from '../../../components/catalog-row';
import LoadingEllipsis from '../../../components/loading-ellipsis';
import BoxModal from '../box-modal';
import { DirectoryCommunity, findDirectoryByAddress } from '../../../hooks/use-directories';
import { getBoardPath } from '../../../lib/utils/route-utils';
import { removeMarkdown } from '../../../lib/utils/post-utils';

interface PopularThreadProps {
  post: Comment;
  boardTitle: string;
  boardPath: string;
}

export const ContentPreview = ({ content, maxLength = 99 }: { content: string; maxLength?: number }) => {
  const plainText = removeMarkdown(content).trim().replaceAll('&nbsp;', '').replace(/\n\n/g, '\n').replaceAll('\n\n', '');
  const truncatedText = plainText.length > maxLength ? `${plainText.substring(0, maxLength).trim()}...` : plainText;

  return truncatedText;
};

const PopularThreadCard = memo(
  ({ post, boardTitle, boardPath }: PopularThreadProps) => {
    const { cid, content, link, linkHeight, linkWidth, thumbnailUrl, title } = post || {};
    const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);

    return (
      <div className={styles.popularThread} key={cid}>
        <div className={styles.title}>{boardTitle}</div>
        <div className={styles.mediaContainer}>
          <Link to={`/${boardPath}/thread/${cid}`}>
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

const PopularThreadsBox = ({
  directories,
  directoryAddresses,
  subplebbits,
}: {
  directories: DirectoryCommunity[];
  directoryAddresses: string[];
  subplebbits: Array<Subplebbit | undefined>;
}) => {
  const { t } = useTranslation();
  const { showWorksafeContentOnly, showNsfwContentOnly } = usePopularThreadsOptionsStore();

  const { filteredBoardAddresses, filteredSubplebbits } = useMemo(() => {
    const filteredEntries = directoryAddresses.flatMap((address, index) => {
      const directoryEntry = findDirectoryByAddress(directories, address);
      if (showWorksafeContentOnly && directoryEntry?.nsfw) {
        return [];
      }
      if (showNsfwContentOnly && !directoryEntry?.nsfw) {
        return [];
      }

      return [{ address, subplebbit: subplebbits[index] }];
    });

    return {
      filteredBoardAddresses: filteredEntries.map((entry) => entry.address),
      filteredSubplebbits: filteredEntries.map((entry) => entry.subplebbit),
    };
  }, [directories, directoryAddresses, showNsfwContentOnly, showWorksafeContentOnly, subplebbits]);

  const { popularPosts, isLoading } = usePopularPosts(filteredSubplebbits, filteredBoardAddresses);

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
          popularPosts.map((post: Comment) => {
            const directoryEntry = findDirectoryByAddress(directories, post.subplebbitAddress);
            const boardTitle = directoryEntry?.title?.replace(/^\/[^/]+\/\s*-\s*/, '') || '';
            const boardPath = post.subplebbitAddress ? getBoardPath(post.subplebbitAddress, directories) : '';
            return <PopularThreadCard key={post.cid} post={post} boardTitle={boardTitle} boardPath={boardPath} />;
          })
        )}
      </div>
    </div>
  );
};

export default PopularThreadsBox;
