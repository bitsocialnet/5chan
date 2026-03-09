import { useCallback, useMemo, useRef } from 'react';
import { Comment, usePublishComment } from '@bitsocialnet/bitsocial-react-hooks';
import usePublishPostStore from '../stores/use-publish-post-store';
import useChallengesStore from '../stores/use-challenges-store';

const usePublishPost = ({ subplebbitAddress }: { subplebbitAddress?: string }) => {
  const { author, title, content, link, spoiler, publishCommentOptions } = usePublishPostStore((state) => ({
    author: state.author,
    title: state.title || undefined,
    content: state.content || undefined,
    link: state.link || undefined,
    spoiler: state.spoiler || false,
    publishCommentOptions: state.publishCommentOptions,
  }));

  const setPublishPostStore = usePublishPostStore((state) => state.setPublishPostStore);
  const resetPublishPostStore = usePublishPostStore((state) => state.resetPublishPostStore);
  const addChallenge = useChallengesStore((state) => state.addChallenge);
  const abandonPublishRef = useRef<(() => Promise<void>) | undefined>();
  const abandonCurrentPublish = useCallback(async () => {
    await abandonPublishRef.current?.();
  }, []);

  const createBaseOptions = useCallback(() => {
    const baseOptions: Comment = {
      subplebbitAddress,
      title,
      content,
      link,
      spoiler,
    };

    const displayName = author?.displayName;
    if (displayName) {
      baseOptions.author = { displayName };
    }

    return baseOptions;
  }, [author, content, link, spoiler, subplebbitAddress, title]);

  const setPublishPostOptions = useCallback(
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
      setPublishPostStore(newOptions);
    },
    [createBaseOptions, setPublishPostStore],
  );

  const resetPublishPostOptions = useCallback(() => resetPublishPostStore(), [resetPublishPostStore]);

  const publishOptionsWithAbandon = useMemo(
    () => ({
      ...publishCommentOptions,
      onChallenge: async (...args: any[]) => {
        addChallenge(args, abandonCurrentPublish);
      },
    }),
    [abandonCurrentPublish, addChallenge, publishCommentOptions],
  );

  const { index, publishComment, abandonPublish } = usePublishComment(publishOptionsWithAbandon);
  abandonPublishRef.current = abandonPublish;

  return {
    setPublishPostOptions,
    resetPublishPostOptions,
    postIndex: index,
    publishPost: publishComment,
    publishPostOptions: publishCommentOptions,
  };
};

export default usePublishPost;
