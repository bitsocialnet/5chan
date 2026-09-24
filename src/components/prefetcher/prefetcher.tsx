import { useComment, useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifier } from '../../hooks/use-community-identifiers';
import usePrefetchStore from '../../stores/use-prefetch-store';

// Subscribes to the hovered thread or board with the hooks its page uses. The page's own hooks join
// the same store entries on navigation, so the updates started here carry over.
const Prefetcher = () => {
  const commentCid = usePrefetchStore((state) => state.commentCid);
  const communityAddress = usePrefetchStore((state) => state.communityAddress);
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  useComment({ commentCid, community: commentCid ? communityIdentifier : undefined });
  useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  return null;
};

export default Prefetcher;
