import { useCallback, useMemo, useRef } from 'react';
import { Comment, usePublishComment } from '@bitsocialhq/bitsocial-react-hooks';
import usePublishReplyStore from '../stores/use-publish-reply-store';
import usePostNumberStore from '../stores/use-post-number-store';
import { getQuotedCidsFromContent, mergeQuotedCids } from '../lib/utils/reply-quote-utils';
import useChallengesStore from '../stores/use-challenges-store';

const usePublishReply = ({ cid, subplebbitAddress, postCid }: { cid: string; subplebbitAddress: string; postCid?: string }) => {
  const parentCid = cid;

  const { author, content, link, spoiler, publishCommentOptions } = usePublishReplyStore((state) => ({
    author: state.author[parentCid],
    content: state.content[parentCid] || undefined,
    link: state.link[parentCid] || undefined,
    spoiler: state.spoiler[parentCid] || false,
    publishCommentOptions: state.publishCommentOptions[parentCid],
  }));

  const setPublishReplyStore = usePublishReplyStore((state) => state.setPublishReplyStore);
  const resetPublishReplyStore = usePublishReplyStore((state) => state.resetPublishReplyStore);
  const addChallenge = useChallengesStore((state) => state.addChallenge);
  const abandonPublishRef = useRef<(() => Promise<void>) | undefined>();

  const createBaseOptions = useCallback(() => {
    const baseOptions: Comment = {
      subplebbitAddress,
      parentCid,
      postCid: postCid ?? parentCid,
      content,
      link,
      spoiler,
    };

    const displayName = author?.displayName;
    if (displayName) {
      baseOptions.author = { displayName };
    }

    return baseOptions;
  }, [author, content, link, parentCid, postCid, spoiler, subplebbitAddress]);

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

  const scopedNumberToCid = usePostNumberStore((state) => (subplebbitAddress ? state.numberToCid[subplebbitAddress] : undefined));
  const quotedCids = useMemo(() => getQuotedCidsFromContent(content, scopedNumberToCid), [content, scopedNumberToCid]);

  const mergedPublishOptions = useMemo(() => mergeQuotedCids(publishCommentOptions, quotedCids), [publishCommentOptions, quotedCids]);
  const publishOptionsWithAbandon = useMemo(
    () => ({
      ...mergedPublishOptions,
      onChallenge: async (...args: any[]) => {
        addChallenge(args, async () => {
          await abandonPublishRef.current?.();
        });
      },
    }),
    [addChallenge, mergedPublishOptions],
  );

  const { index, publishComment, abandonPublish } = usePublishComment(publishOptionsWithAbandon);
  abandonPublishRef.current = abandonPublish;

  return {
    setPublishReplyOptions,
    resetPublishReplyOptions,
    replyIndex: index,
    publishReply: publishComment,
  };
};

export default usePublishReply;
