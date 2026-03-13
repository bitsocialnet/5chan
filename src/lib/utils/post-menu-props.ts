import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';
import { getCommentCommunityAddress } from './comment-utils';

export type PostMenuProps = {
  cid?: string;
  postCid?: string;
  parentCid?: string;
  communityAddress?: string;
  subplebbitAddress?: string;
  authorAddress?: string;
  link?: string;
  linkWidth?: number;
  linkHeight?: number;
  thumbnailUrl?: string;
  deleted?: boolean;
  removed?: boolean;
};

export const selectPostMenuProps = (post?: Comment): PostMenuProps => {
  const communityAddress = getCommentCommunityAddress(post);

  return {
    cid: post?.cid,
    postCid: post?.postCid,
    parentCid: post?.parentCid,
    communityAddress,
    subplebbitAddress: post?.subplebbitAddress,
    authorAddress: post?.author?.address,
    link: post?.link,
    linkWidth: post?.linkWidth,
    linkHeight: post?.linkHeight,
    thumbnailUrl: post?.thumbnailUrl,
    deleted: post?.deleted,
    removed: post?.removed,
  };
};
