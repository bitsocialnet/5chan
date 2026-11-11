import { ChallengeVerification, Comment, CommentGalleryItem, PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import { alertChallengeVerificationFailed } from '../lib/utils/challenge-utils';
import { getCommentCommunityAddress } from '../lib/utils/comment-utils';
import { normalizePublishURL } from '../lib/utils/url-utils';

type ReplyState = {
  author: { [parentCid: string]: any | undefined };
  displayName: { [parentCid: string]: string | undefined };
  content: { [parentCid: string]: string | undefined };
  link: { [parentCid: string]: string | undefined };
  gallery: { [parentCid: string]: CommentGalleryItem[] | undefined };
  flairs: { [parentCid: string]: Comment['flairs'] | undefined };
  spoiler: { [parentCid: string]: boolean | undefined };
  challengeRequest: { [parentCid: string]: Record<string, unknown> | undefined };
  publishCommentOptions: { [parentCid: string]: PublishCommentOptions | undefined };
  /** Entries are keyed by parentCid unless the form gives its own key, so two forms replying to one post stay apart. */
  setPublishReplyStore: (comment: Comment, storeKey?: string) => void;
  resetPublishReplyStore: (storeKey: string) => void;
};

const usePublishReplyStore = create<ReplyState>((set) => ({
  author: {},
  displayName: {},
  content: {},
  link: {},
  gallery: {},
  flairs: {},
  spoiler: {},
  challengeRequest: {},
  publishCommentOptions: {},

  setPublishReplyStore: (comment: Comment, storeKey = comment.parentCid) =>
    set((state) => {
      const { parentCid, author, challengeRequest, content, flairs, spoiler, timestamp } = comment;
      const link = comment.link ? normalizePublishURL(comment.link) : undefined;
      // A comment has no gallery rather than an empty one.
      const gallery = comment.gallery?.length ? comment.gallery : undefined;
      const communityAddress = getCommentCommunityAddress(comment);

      const displayName = 'displayName' in comment ? comment.displayName || undefined : author?.displayName;

      const baseAuthor = author ? { ...author } : {};
      delete baseAuthor.displayName;

      const updatedAuthor = displayName ? { ...baseAuthor, displayName } : baseAuthor;

      const publishCommentOptions: PublishCommentOptions = {
        communityAddress,
        parentCid,
        postCid: comment?.postCid || parentCid,
        content,
        link,
        ...(gallery ? { gallery } : {}),
        flairs,
        spoiler,
        ...(challengeRequest ? { challengeRequest } : {}),
        // Only a tripcode's proof sets the timestamp, which it signs; otherwise the account sets it when publishing.
        ...(typeof timestamp === 'number' ? { timestamp } : {}),
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
        author: { ...state.author, [storeKey]: updatedAuthor },
        displayName: { ...state.displayName, [storeKey]: displayName },
        content: { ...state.content, [storeKey]: content },
        link: { ...state.link, [storeKey]: link },
        gallery: { ...state.gallery, [storeKey]: gallery },
        flairs: { ...state.flairs, [storeKey]: flairs },
        spoiler: { ...state.spoiler, [storeKey]: spoiler },
        challengeRequest: { ...state.challengeRequest, [storeKey]: challengeRequest },
        publishCommentOptions: { ...state.publishCommentOptions, [storeKey]: publishCommentOptions },
      };
    }),

  resetPublishReplyStore: (storeKey) =>
    set((state) => ({
      author: { ...state.author, [storeKey]: undefined },
      displayName: { ...state.displayName, [storeKey]: undefined },
      content: { ...state.content, [storeKey]: undefined },
      link: { ...state.link, [storeKey]: undefined },
      gallery: { ...state.gallery, [storeKey]: undefined },
      flairs: { ...state.flairs, [storeKey]: undefined },
      spoiler: { ...state.spoiler, [storeKey]: undefined },
      challengeRequest: { ...state.challengeRequest, [storeKey]: undefined },
      publishCommentOptions: { ...state.publishCommentOptions, [storeKey]: undefined },
    })),
}));

export default usePublishReplyStore;
