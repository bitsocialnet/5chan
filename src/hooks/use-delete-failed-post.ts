import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChallengeVerification, Comment, PublishCommentOptions, deleteComment, usePublishComment } from '@bitsocial/bitsocial-react-hooks';
import { alertChallengeVerificationFailed } from '../lib/utils/challenge-utils';
import useChallengesStore from '../stores/use-challenges-store';
import useFailedPostRetryStore from '../stores/use-failed-post-retry-store';
import { getCommentCommunityAddress } from '../lib/utils/comment-utils';
import { hasSameTripcodeKeys, hasTripcodeProof, parseTripcodeInput, parseTripcodeProof, stripTripcodeProof } from '../lib/utils/tripcode-utils';
import useTripcodeStore from '../stores/use-tripcode-store';
import useSignTripcode from './use-sign-tripcode';
import useTripcodeRepublish from './use-tripcode-republish';

const retryExcludedFields = new Set([
  'accountId',
  'cid',
  'clients',
  'depth',
  'error',
  'errors',
  'index',
  'publishingState',
  'shortCommunityAddress',
  'state',
  'timestamp',
]);

type FailedPost = Partial<Comment> & {
  accountId?: string;
  cid?: string;
  index?: number;
  state?: string;
};

const cloneRetryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (value && typeof value === 'object') {
    return { ...(value as Record<string, unknown>) };
  }

  return value;
};

const getDeleteTarget = (post?: FailedPost) => post?.cid ?? post?.index;

export const getFailedPostRetryPublishOptions = (post?: FailedPost): PublishCommentOptions | undefined => {
  if (post?.state !== 'failed') {
    return undefined;
  }

  const retryOptions = Object.entries(post).reduce((acc, [key, value]) => {
    if (retryExcludedFields.has(key) || typeof value === 'undefined') {
      return acc;
    }

    acc[key] = cloneRetryValue(value);
    return acc;
  }, {} as PublishCommentOptions);

  if (retryOptions.author && typeof retryOptions.author === 'object' && !Array.isArray(retryOptions.author)) {
    const author = { ...retryOptions.author };
    delete author.shortAddress;
    // A tripcode proof signs the failed post's timestamp, and the retry publishes with a new one.
    if (typeof author.displayName === 'string') {
      const name = stripTripcodeProof(author.displayName);
      if (name) author.displayName = name;
      else delete author.displayName;
    }
    retryOptions.author = author;
  }

  const communityAddress = retryOptions.communityAddress ?? getCommentCommunityAddress(post);
  if (!communityAddress) {
    return undefined;
  }
  retryOptions.communityAddress = communityAddress;

  return retryOptions;
};

const useDeleteFailedPost = (post?: FailedPost, deleteRedirectPath?: string) => {
  const { t } = useTranslation();
  const [isDeletingFailedPost, setIsDeletingFailedPost] = useState(false);
  const [isRetryingFailedPost, setIsRetryingFailedPost] = useState(false);
  const [isRetryRedirectPending, setIsRetryRedirectPending] = useState(false);
  const addChallenge = useChallengesStore((state) => state.addChallenge);
  const startRetry = useFailedPostRetryStore((state) => state.startRetry);
  const endRetry = useFailedPostRetryStore((state) => state.endRetry);
  const navigate = useNavigate();
  const abandonPublishRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const { keepTripcode, forgetTripcode, onBeforeRepublish } = useTripcodeRepublish();
  const abandonCurrentPublish = useCallback(async () => {
    // Abandoning the republish challenge ends the retry. Clear the flag first so PendingPost resumes its
    // normal abandoned-challenge handling (back to the board) instead of staying stuck on an empty row.
    setIsRetryRedirectPending(false);
    endRetry();
    forgetTripcode();
    await abandonPublishRef.current?.();
  }, [endRetry, forgetTripcode]);

  const canDeleteFailedPost = post?.state === 'failed' && typeof post?.index === 'number';
  const baseRetryPublishOptions = useMemo(() => getFailedPostRetryPublishOptions(post), [post]);
  // A tripcode post is signed again before its retry. Its password is never stored with the post, so the
  // retry uses the tripcode its account's name field holds now, and only if that gives the trips the post showed.
  const tripcodeInput = useTripcodeStore((state) => (post?.accountId ? state.inputs[post.accountId] : undefined));
  const signTripcode = useSignTripcode();
  const [signedRetryTripcode, setSignedRetryTripcode] = useState<{ post: FailedPost; displayName: string; timestamp: number }>();
  const retryAfterSigningRef = useRef(false);
  const retryPublishOptions = useMemo(
    () =>
      baseRetryPublishOptions && signedRetryTripcode && signedRetryTripcode.post === post
        ? {
            ...baseRetryPublishOptions,
            author: { ...baseRetryPublishOptions.author, displayName: signedRetryTripcode.displayName },
            timestamp: signedRetryTripcode.timestamp,
          }
        : baseRetryPublishOptions,
    [baseRetryPublishOptions, post, signedRetryTripcode],
  );
  const publishOptionsWithCallbacks = useMemo<PublishCommentOptions | undefined>(
    () =>
      retryPublishOptions
        ? {
            ...retryPublishOptions,
            ...(hasTripcodeProof(retryPublishOptions.author?.displayName) ? { onBeforeRepublish } : {}),
            onChallenge: async (...args: any[]) => {
              addChallenge(args, abandonCurrentPublish);
            },
            onChallengeVerification: async (challengeVerification: ChallengeVerification, comment: Comment) => {
              if (challengeVerification.challengeSuccess === true) forgetTripcode();
              alertChallengeVerificationFailed(challengeVerification, comment);
            },
            onError: (error: Error) => {
              console.error('Failed to retry failed post:', error);
              forgetTripcode();
              setIsRetryRedirectPending(false);
              endRetry();
              alert(`Failed to retry post: ${error.message}`);
            },
          }
        : undefined,
    [abandonCurrentPublish, addChallenge, endRetry, forgetTripcode, onBeforeRepublish, retryPublishOptions],
  );
  const { abandonPublish, index: retryPostIndex, publishComment } = usePublishComment(publishOptionsWithCallbacks);
  abandonPublishRef.current = abandonPublish;

  useEffect(() => {
    if (!isRetryRedirectPending || typeof retryPostIndex !== 'number') {
      return;
    }

    // oxlint-disable-next-line react/set-state-in-effect -- usePublishComment reports the stored retry only through its index state
    setIsRetryRedirectPending(false);
    // Navigate to the new pending row before clearing the retry flag so PendingPost never observes a
    // committed "old index + no retry flag + no addressable post" state that would bounce to the board.
    navigate(`/pending/${retryPostIndex}`, { replace: true });
    endRetry();
  }, [endRetry, isRetryRedirectPending, navigate, retryPostIndex]);

  const onDeleteFailedPost = useCallback(() => {
    if (isDeletingFailedPost || isRetryingFailedPost || !canDeleteFailedPost) {
      return;
    }

    const targetComment = getDeleteTarget(post);
    if (typeof targetComment === 'undefined') {
      return;
    }

    setIsDeletingFailedPost(true);
    deleteComment(targetComment)
      .then(() => {
        setIsDeletingFailedPost(false);
        if (deleteRedirectPath) {
          navigate(deleteRedirectPath, { replace: true });
        }
      })
      .catch((error) => {
        console.error('Failed to delete failed post:', error);
        alert(`Failed to delete post: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsDeletingFailedPost(false);
      });
  }, [canDeleteFailedPost, deleteRedirectPath, isDeletingFailedPost, isRetryingFailedPost, navigate, post]);

  const canRetryFailedPost = canDeleteFailedPost && Boolean(retryPublishOptions);

  const retryFailedPost = useCallback(async () => {
    const targetComment = getDeleteTarget(post);
    if (typeof targetComment === 'undefined') {
      setIsRetryingFailedPost(false);
      return;
    }

    const accountCommentIndex = post?.index;

    setIsRetryingFailedPost(true);
    setIsRetryRedirectPending(true);
    // Mark this pending row as mid-retry so the pending view does not treat the brief
    // post-delete gap (no addressable comment, no active challenge yet) as an abandoned challenge.
    if (typeof accountCommentIndex === 'number') {
      startRetry(accountCommentIndex);
    }

    try {
      await deleteComment(targetComment);
      await publishComment();
    } catch (error) {
      console.error('Failed to retry failed post:', error);
      forgetTripcode();
      setIsRetryRedirectPending(false);
      endRetry();
      alert(`Failed to retry post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRetryingFailedPost(false);
    }
  }, [endRetry, forgetTripcode, post, publishComment, startRetry]);

  // The retry publishes the options of the render that holds the new proof.
  useEffect(() => {
    if (!retryAfterSigningRef.current || signedRetryTripcode?.post !== post) return;
    retryAfterSigningRef.current = false;
    void retryFailedPost();
  }, [post, retryFailedPost, signedRetryTripcode]);

  const onRetryFailedPost = useCallback(async () => {
    if (isDeletingFailedPost || isRetryingFailedPost || !canRetryFailedPost || typeof getDeleteTarget(post) === 'undefined') {
      return;
    }

    const failedProof = parseTripcodeProof(post?.author?.displayName);
    if (!failedProof || !baseRetryPublishOptions) {
      await retryFailedPost();
      return;
    }

    // Retrying without the post's tripcode would drop its trip, or show another one, without a word.
    const tripcodeSecret = parseTripcodeInput(tripcodeInput).secret;
    if (!tripcodeSecret) {
      alert(t('tripcode_retry_mismatch'));
      return;
    }

    setIsRetryingFailedPost(true);
    try {
      let isSameTripcode = false;
      const signed = await signTripcode({
        secret: tripcodeSecret,
        readOptions: () => baseRetryPublishOptions,
        writeOptions: ({ displayName, timestamp }) => {
          isSameTripcode = hasSameTripcodeKeys(failedProof, parseTripcodeProof(displayName));
          if (!isSameTripcode) return;
          keepTripcode({ displayName, secret: tripcodeSecret, name: baseRetryPublishOptions.author?.displayName });
          retryAfterSigningRef.current = true;
          setSignedRetryTripcode({ post: post as FailedPost, displayName, timestamp });
        },
        isActive: () => true,
      });
      if (!signed || !isSameTripcode) setIsRetryingFailedPost(false);
      if (signed && !isSameTripcode) alert(t('tripcode_retry_mismatch'));
    } catch (error) {
      setIsRetryingFailedPost(false);
      alert(error instanceof Error ? error.message : String(error));
    }
  }, [baseRetryPublishOptions, canRetryFailedPost, isDeletingFailedPost, isRetryingFailedPost, keepTripcode, post, retryFailedPost, signTripcode, t, tripcodeInput]);

  return {
    canDeleteFailedPost,
    canRetryFailedPost,
    isDeletingFailedPost,
    isRetryingFailedPost,
    onDeleteFailedPost,
    onRetryFailedPost,
  };
};

export default useDeleteFailedPost;
