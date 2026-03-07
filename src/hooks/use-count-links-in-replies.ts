import { useMemo } from 'react';
import { Comment } from '@bitsocialhq/bitsocial-react-hooks';
import { flattenCommentsPages } from '@bitsocialhq/bitsocial-react-hooks/dist/lib/utils';

const useCountLinksInReplies = (comment: Comment, firstXReplies?: number) => {
  let linkCount = 0;
  const flattenedReplies = useMemo(() => flattenCommentsPages(comment?.replies), [comment?.replies]);

  const repliesToConsider = firstXReplies !== undefined ? flattenedReplies.slice(0, firstXReplies) : flattenedReplies;

  for (let reply of repliesToConsider) {
    if (reply.link) {
      linkCount++;
    }
  }

  return linkCount;
};

export default useCountLinksInReplies;
