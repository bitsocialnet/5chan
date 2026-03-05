import { ChallengeVerification, Comment, PublishCommentOptions } from '@bitsocialhq/bitsocial-react-hooks';
import { create } from 'zustand';
import { alertChallengeVerificationFailed } from '../lib/utils/challenge-utils';

type SubmitState = {
  author?: any | undefined;
  displayName?: string | undefined;
  subplebbitAddress: string | undefined;
  title: string | undefined;
  content: string | undefined;
  link: string | undefined;
  spoiler: boolean | undefined;
  publishCommentOptions: PublishCommentOptions;
  setPublishPostStore: (data: Partial<SubmitState>) => void;
  resetPublishPostStore: () => void;
};

const usePublishPostStore = create<SubmitState>((set) => ({
  author: undefined,
  displayName: undefined,
  subplebbitAddress: undefined,
  title: undefined,
  content: undefined,
  link: undefined,
  spoiler: undefined,
  publishCommentOptions: {},
  setPublishPostStore: (comment: Comment) =>
    set(() => {
      const { subplebbitAddress, author, content, link, spoiler, title } = comment;

      const displayName = 'displayName' in comment ? comment.displayName || undefined : author?.displayName;

      const baseAuthor = author ? { ...author } : {};
      delete baseAuthor.displayName;

      const updatedAuthor = displayName ? { ...baseAuthor, displayName } : baseAuthor;

      const publishCommentOptions: PublishCommentOptions = {
        subplebbitAddress,
        title,
        content,
        link,
        spoiler,
        onChallengeVerification: (challengeVerification: ChallengeVerification, comment: Comment) => {
          alertChallengeVerificationFailed(challengeVerification, comment);
        },
        onError: (error: Error) => {
          console.error(error);
          alert(error.message);
        },
      };

      if (Object.keys(updatedAuthor).length > 0) {
        publishCommentOptions.author = updatedAuthor;
      }

      return {
        author: updatedAuthor,
        displayName,
        subplebbitAddress,
        title,
        content,
        link,
        spoiler,
        publishCommentOptions,
      };
    }),
  resetPublishPostStore: () =>
    set({
      author: undefined,
      displayName: undefined,
      subplebbitAddress: undefined,
      title: undefined,
      content: undefined,
      link: undefined,
      spoiler: undefined,
      publishCommentOptions: {},
    }),
}));

export default usePublishPostStore;
