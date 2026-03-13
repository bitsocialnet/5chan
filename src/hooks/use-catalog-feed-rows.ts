import { useMemo } from 'react';
import { useAccountComments, type Community } from '@bitsocialnet/bitsocial-react-hooks';
import { getCommentCommunityAddress } from '../lib/utils/comment-utils';

const useCatalogFeedRows = (columnCount: number, feed: any, isFeedLoaded: boolean, community: Community) => {
  const { address } = community || {};

  const { accountComments } = useAccountComments();

  const feedWithFakePostsOnTop = useMemo(() => {
    if (!isFeedLoaded) {
      return []; // prevent temporary/mock posts from appearing while the actual feed is loading
    }

    const _feed = [...feed];

    // show account comments instantly in the feed once published (cid defined), instead of waiting for the feed to update
    const filteredComments = accountComments.filter((comment) => {
      const { cid, deleted, postCid, removed, state, timestamp } = comment || {};
      const communityAddress = getCommentCommunityAddress(comment);

      return (
        !deleted &&
        !removed &&
        timestamp > Date.now() - 60 * 60 * 1000 &&
        state === 'succeeded' &&
        cid &&
        cid === postCid &&
        communityAddress === address &&
        !_feed.some((feedItem) => feedItem.cid === cid)
      );
    });

    // show newest account comment at the top of the feed but after pinned posts
    const lastPinnedIndex = _feed.map((post) => post.pinned).lastIndexOf(true);
    if (filteredComments.length > 0) {
      _feed.splice(
        lastPinnedIndex + 1,
        0,
        ...filteredComments.map((comment) => ({
          ...comment,
          isAccountComment: true,
        })),
      );
    }

    return _feed;
  }, [accountComments, feed, address, isFeedLoaded]);

  const rows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < feedWithFakePostsOnTop.length; i += columnCount) {
      rows.push(feedWithFakePostsOnTop.slice(i, i + columnCount));
    }
    return rows;
  }, [feedWithFakePostsOnTop, columnCount]);

  return rows;
};

export default useCatalogFeedRows;
