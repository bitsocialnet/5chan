import { useMemo } from 'react';
import { Comment } from '@bitsocial/bitsocial-react-hooks';
import { flattenCommentsPages } from '../lib/bitsocial-internals/utils';
import { getCommentFileCount } from '../lib/utils/media-utils';

const useCountLinksInReplies = (comment: Comment | undefined, firstXReplies?: number) => {
  let linkCount = 0;
  const flattenedReplies = useMemo(() => flattenCommentsPages(comment?.replies), [comment?.replies]);

  const repliesToConsider = firstXReplies !== undefined ? flattenedReplies.slice(0, firstXReplies) : flattenedReplies;

  // Like 4chan's image count, a reply counts once per file, so its gallery files count too.
  for (let reply of repliesToConsider) {
    linkCount += getCommentFileCount(reply);
  }

  return linkCount;
};

export default useCountLinksInReplies;
