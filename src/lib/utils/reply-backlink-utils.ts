import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';

interface GetRenderableMobileBacklinksArgs {
  cid?: string;
  parentCid?: string;
  quotedByMap?: Map<string, Comment[]>;
  directRepliesByParentCid?: Map<string, Comment[]>;
}

interface RenderableMobileBacklinks {
  opBacklinks: Comment[];
  directReplyBacklinks: Comment[];
  quotedReplyBacklinks: Comment[];
}

const isRenderableBacklinkReply = (reply?: Comment) => Boolean(reply?.cid && typeof reply.number === 'number' && !(reply.deleted || reply.removed));

export const getRenderableMobileBacklinks = ({ cid, parentCid, quotedByMap, directRepliesByParentCid }: GetRenderableMobileBacklinksArgs): RenderableMobileBacklinks => {
  if (!cid) {
    return {
      opBacklinks: [],
      directReplyBacklinks: [],
      quotedReplyBacklinks: [],
    };
  }

  const quotedReplies = quotedByMap?.get(cid) ?? [];

  if (!parentCid) {
    return {
      opBacklinks: quotedReplies.filter(isRenderableBacklinkReply),
      directReplyBacklinks: [],
      quotedReplyBacklinks: [],
    };
  }

  const directReplies = directRepliesByParentCid?.get(cid) ?? [];

  return {
    opBacklinks: [],
    directReplyBacklinks: directReplies.filter((reply) => reply?.parentCid === cid && isRenderableBacklinkReply(reply)),
    quotedReplyBacklinks: quotedReplies.filter((reply) => reply?.parentCid !== cid && isRenderableBacklinkReply(reply)),
  };
};
