import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';

export type PostMenuProps = {
  cid?: string;
  postCid?: string;
  parentCid?: string;
  subplebbitAddress?: string;
  authorAddress?: string;
  link?: string;
  linkWidth?: number;
  linkHeight?: number;
  thumbnailUrl?: string;
  deleted?: boolean;
  removed?: boolean;
};

export const selectPostMenuProps = (post?: Comment): PostMenuProps => ({
  cid: post?.cid,
  postCid: post?.postCid,
  parentCid: post?.parentCid,
  subplebbitAddress: post?.subplebbitAddress,
  authorAddress: post?.author?.address,
  link: post?.link,
  linkWidth: post?.linkWidth,
  linkHeight: post?.linkHeight,
  thumbnailUrl: post?.thumbnailUrl,
  deleted: post?.deleted,
  removed: post?.removed,
});
