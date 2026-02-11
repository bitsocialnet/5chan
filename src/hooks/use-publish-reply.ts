import { useCallback, useMemo } from 'react';
import { Comment, useAccount, usePublishComment } from '@plebbit/plebbit-react-hooks';
import usePublishReplyStore from '../stores/use-publish-reply-store';
import usePostNumberStore from '../stores/use-post-number-store';
import { getQuotedCidsFromContent, mergeQuotedCids } from '../lib/utils/reply-quote-utils';

const usePublishReply = ({ cid, subplebbitAddress, postCid }: { cid: string; subplebbitAddress: string; postCid?: string }) => {
  const parentCid = cid;
  const account = useAccount();

  const { author, content, link, spoiler, publishCommentOptions } = usePublishReplyStore((state) => ({
    author: state.author[parentCid],
    content: state.content[parentCid] || undefined,
    link: state.link[parentCid] || undefined,
    spoiler: state.spoiler[parentCid] || false,
    publishCommentOptions: state.publishCommentOptions[parentCid],
  }));

  const setPublishReplyStore = usePublishReplyStore((state) => state.setPublishReplyStore);
  const resetPublishReplyStore = usePublishReplyStore((state) => state.resetPublishReplyStore);

  const createBaseOptions = useCallback(() => {
    const baseOptions: Comment = {
      subplebbitAddress,
      parentCid,
      postCid: postCid ?? parentCid,
      content,
      link,
      spoiler,
    };

    baseOptions.author = {
      ...account?.author,
      displayName: author?.displayName || account?.author?.displayName,
    };

    return baseOptions;
  }, [author, content, link, parentCid, postCid, spoiler, subplebbitAddress, account]);

  const setPublishReplyOptions = useCallback(
    (options: Partial<Comment>) => {
      const baseOptions = createBaseOptions();
      const sanitizedOptions = Object.entries(options).reduce(
        (acc, [key, value]) => {
          acc[key] = value === '' ? undefined : value;
          return acc;
        },
        {} as Partial<Comment>,
      );

      const newOptions = { ...baseOptions, ...sanitizedOptions };
      setPublishReplyStore(newOptions);
    },
    [createBaseOptions, setPublishReplyStore],
  );

  const resetPublishReplyOptions = useCallback(() => resetPublishReplyStore(parentCid), [parentCid, resetPublishReplyStore]);

  const numberToCid = usePostNumberStore((state) => state.numberToCid);
  const quotedCids = useMemo(() => getQuotedCidsFromContent(content, numberToCid), [content, numberToCid]);

  const publishOptions = useMemo(() => mergeQuotedCids(publishCommentOptions, quotedCids), [publishCommentOptions, quotedCids]);

  const { index, publishComment } = usePublishComment(publishOptions);

  return {
    setPublishReplyOptions,
    resetPublishReplyOptions,
    replyIndex: index,
    publishReply: publishComment,
  };
};

export default usePublishReply;
