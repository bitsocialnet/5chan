import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Comment, Role, useComment, useEditedComment, useSubplebbit } from '@plebbit/plebbit-react-hooks';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { isAllView } from '../../lib/utils/view-utils';
import { useResolvedSubplebbitAddress } from '../../hooks/use-resolved-subplebbit-address';
import { useDirectories } from '../../hooks/use-directories';
import { isDirectoryBoard } from '../../lib/utils/route-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import ErrorDisplay from '../../components/error-display/error-display';
import PostDesktop from '../../components/post-desktop';
import PostMobile from '../../components/post-mobile';
import styles from './post.module.css';

export interface PostProps {
  index?: number;
  isHidden?: boolean;
  hasThumbnail?: boolean;
  post?: any;
  postReplyCount?: number;
  reply?: any;
  roles?: Role[];
  showAllReplies?: boolean;
  showReplies?: boolean;
  targetReplyCid?: string;
  threadNumber?: number;
  isModQueue?: boolean;
  modQueueStatus?: 'approved' | 'rejected' | 'failed' | null;
  modQueueError?: string;
  isPublishing?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  quotedByMap?: Map<string, Comment[]>;
  isInPostPageView?: boolean;
}

export const Post = ({
  post,
  showAllReplies = false,
  showReplies = true,
  targetReplyCid,
  isModQueue,
  modQueueStatus,
  modQueueError,
  isPublishing,
  onApprove,
  onReject,
}: PostProps) => {
  // Only subscribe to roles field to avoid rerenders from updatingState changes
  const roles = useSubplebbitField(post?.subplebbitAddress, (subplebbit) => subplebbit?.roles);
  const isMobile = useIsMobile();

  let comment = post;

  // handle pending mod or author edit
  const { editedComment } = useEditedComment({ comment });
  if (editedComment) {
    comment = editedComment;
  }

  return (
    <div className={styles.thread}>
      <div className={styles.postContainer}>
        {isMobile ? (
          <PostMobile
            post={comment}
            roles={roles}
            showAllReplies={showAllReplies}
            showReplies={showReplies}
            targetReplyCid={targetReplyCid}
            isModQueue={isModQueue}
            modQueueStatus={modQueueStatus}
            modQueueError={modQueueError}
            isPublishing={isPublishing}
            onApprove={onApprove}
            onReject={onReject}
          />
        ) : (
          <PostDesktop
            post={comment}
            roles={roles}
            showAllReplies={showAllReplies}
            showReplies={showReplies}
            targetReplyCid={targetReplyCid}
            isModQueue={isModQueue}
            modQueueStatus={modQueueStatus}
            modQueueError={modQueueError}
            isPublishing={isPublishing}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}
      </div>
    </div>
  );
};

const PostPage = () => {
  const { t } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const { commentCid } = params;
  const subplebbitAddress = useResolvedSubplebbitAddress();
  const isInAllView = isAllView(location.pathname);

  const comment = useComment({ commentCid });

  const navigate = useNavigate();
  useEffect(() => {
    if (comment?.subplebbitAddress && subplebbitAddress && comment.subplebbitAddress !== subplebbitAddress) {
      navigate('/not-found', { replace: true });
    }
  }, [comment?.subplebbitAddress, subplebbitAddress, navigate]);

  const subplebbit = useSubplebbit({ subplebbitAddress });
  const { error: subplebbitError, shortAddress, title } = subplebbit || {};
  const directories = useDirectories();

  // if the comment is a reply, return the post comment instead, then the reply will be highlighted in the thread
  const postComment = useComment({ commentCid: comment?.postCid });
  let post: Comment;
  if (comment.parentCid) {
    post = postComment;
  } else {
    post = comment;
  }

  const { error } = post || {};

  useEffect(() => {
    if (!comment?.cid || comment.parentCid) return;
    window.scrollTo(0, 0);
  }, [comment?.cid, comment?.parentCid]);

  useEffect(() => {
    const boardIdentifier = params.boardIdentifier;
    const isDirectory = boardIdentifier ? isDirectoryBoard(boardIdentifier, directories) : false;

    let boardTitle: string;
    if (isInAllView) {
      boardTitle = t('all');
    } else if (isDirectory) {
      boardTitle = `/${boardIdentifier}/`;
    } else {
      boardTitle = title ? title : shortAddress || subplebbitAddress || '';
    }

    const postTitle = post?.title?.slice(0, 30) || post?.content?.slice(0, 30);
    const postTitlePart = postTitle ? ` - ${postTitle.trim()}...` : '';
    document.title = `${boardTitle}${postTitlePart} - 5chan`;
  }, [title, shortAddress, subplebbitAddress, post?.title, post?.content, isInAllView, t, params.boardIdentifier, directories]);

  const shouldShowCommentError = comment?.error?.message && !comment?.cid;
  const shouldShowPostError = post?.error && post?.replyCount > 0 && post?.replies?.length === 0;
  const shouldShowSubplebbitError = subplebbitError?.message && !post?.cid;

  const targetReplyCid = comment?.parentCid ? comment?.cid : undefined;

  return (
    <div className={styles.content}>
      {shouldShowPostError && (
        <div className={styles.error}>
          <ErrorDisplay error={error} />
        </div>
      )}
      <Post post={post} showAllReplies={true} targetReplyCid={targetReplyCid} />
      {shouldShowSubplebbitError && (
        <div className={styles.error}>
          <ErrorDisplay error={subplebbitError} />
        </div>
      )}
      {shouldShowCommentError && (
        <div className={styles.error}>
          <ErrorDisplay error={comment?.error} />
        </div>
      )}
    </div>
  );
};

export default PostPage;
