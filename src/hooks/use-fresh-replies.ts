import { useMemo } from 'react';
import { Comment, useAccountComments } from '@bitsocialnet/bitsocial-react-hooks';

const useFreshReplies = (replies: Comment[] = []) => {
  const { accountComments } = useAccountComments();

  return useMemo(() => {
    if (!replies.length || !accountComments?.length) {
      return replies;
    }

    const accountCommentsByIndex = new Map<number, Comment>();
    for (const accountComment of accountComments) {
      if (typeof accountComment?.index === 'number') {
        accountCommentsByIndex.set(accountComment.index, accountComment);
      }
    }

    let hasFreshReplies = false;
    const nextReplies = replies.map((reply) => {
      if (typeof reply?.index !== 'number') {
        return reply;
      }

      const freshReply = accountCommentsByIndex.get(reply.index);
      if (!freshReply) {
        return reply;
      }

      hasFreshReplies = true;
      return freshReply;
    });

    return hasFreshReplies ? nextReplies : replies;
  }, [accountComments, replies]);
};

export default useFreshReplies;
