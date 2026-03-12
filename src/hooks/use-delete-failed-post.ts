import { useCallback, useState } from 'react';
import { deleteComment } from '@bitsocialnet/bitsocial-react-hooks';

const useDeleteFailedPost = (post?: { cid?: string; index?: number; state?: string }) => {
  const [isDeletingFailedPost, setIsDeletingFailedPost] = useState(false);

  const canDeleteFailedPost = post?.state === 'failed' && typeof post?.index === 'number';

  const onDeleteFailedPost = useCallback(() => {
    if (isDeletingFailedPost || !canDeleteFailedPost) {
      return;
    }

    const targetComment = post?.cid ?? post?.index;
    if (typeof targetComment === 'undefined') {
      return;
    }

    setIsDeletingFailedPost(true);
    deleteComment(targetComment)
      .then(() => {
        setIsDeletingFailedPost(false);
      })
      .catch((error) => {
        console.error('Failed to delete failed post:', error);
        alert(`Failed to delete post: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsDeletingFailedPost(false);
      });
  }, [canDeleteFailedPost, isDeletingFailedPost, post?.cid, post?.index]);

  return {
    canDeleteFailedPost,
    isDeletingFailedPost,
    onDeleteFailedPost,
  };
};

export default useDeleteFailedPost;
