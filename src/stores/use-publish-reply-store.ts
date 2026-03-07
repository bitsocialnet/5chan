import { ChallengeVerification, Comment, PublishCommentOptions } from '@bitsocialhq/bitsocial-react-hooks';
import { create } from 'zustand';
import { alertChallengeVerificationFailed } from '../lib/utils/challenge-utils';

type ReplyState = {
  author: { [parentCid: string]: any | undefined };
  displayName: { [parentCid: string]: string | undefined };
  content: { [parentCid: string]: string | undefined };
  link: { [parentCid: string]: string | undefined };
  spoiler: { [parentCid: string]: boolean | undefined };
  publishCommentOptions: { [parentCid: string]: PublishCommentOptions | undefined };
  setPublishReplyStore: (comment: Comment) => void;
  resetPublishReplyStore: (parentCid: string) => void;
};

const usePublishReplyStore = create<ReplyState>((set) => ({
  author: {},
  displayName: {},
  content: {},
  link: {},
  spoiler: {},
  publishCommentOptions: {},

  setPublishReplyStore: (comment: Comment) =>
    set((state) => {
      const { subplebbitAddress, parentCid, author, content, link, spoiler } = comment;

      const displayName = 'displayName' in comment ? comment.displayName || undefined : author?.displayName;

      const baseAuthor = author ? { ...author } : {};
      delete baseAuthor.displayName;

      const updatedAuthor = displayName ? { ...baseAuthor, displayName } : baseAuthor;

      const publishCommentOptions: PublishCommentOptions = {
        subplebbitAddress,
        parentCid,
        postCid: comment?.postCid || parentCid,
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
        author: { ...state.author, [parentCid]: updatedAuthor },
        displayName: { ...state.displayName, [parentCid]: displayName },
        content: { ...state.content, [parentCid]: content },
        link: { ...state.link, [parentCid]: link },
        spoiler: { ...state.spoiler, [parentCid]: spoiler },
        publishCommentOptions: { ...state.publishCommentOptions, [parentCid]: publishCommentOptions },
      };
    }),

  resetPublishReplyStore: (parentCid) =>
    set((state) => ({
      author: { ...state.author, [parentCid]: undefined },
      displayName: { ...state.displayName, [parentCid]: undefined },
      content: { ...state.content, [parentCid]: undefined },
      link: { ...state.link, [parentCid]: undefined },
      spoiler: { ...state.spoiler, [parentCid]: undefined },
      publishCommentOptions: { ...state.publishCommentOptions, [parentCid]: undefined },
    })),
}));

export default usePublishReplyStore;
