import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChallengeVerification, Comment, usePublishComment } from '@bitsocial/bitsocial-react-hooks';
import { useShallow } from 'zustand/react/shallow';
import usePublishPostStore, { type PublishPostStore } from '../stores/use-publish-post-store';
import useChallengesStore from '../stores/use-challenges-store';
import usePublishAuthorDomainGuard, { getPublishAuthorDomainErrorMessage } from './use-publish-author-domain-guard';
import usePendingPublishRequest from './use-pending-publish-request';
import useSignTripcode from './use-sign-tripcode';
import useTripcodeRepublish from './use-tripcode-republish';
import { getDuplicateMediaChallengeError } from '../lib/utils/challenge-utils';
import { hasTripcodeProof, type TripcodeSecret } from '../lib/utils/tripcode-utils';
import type { PostingAnalyticsAttempt } from '../lib/posting-analytics';

type UsePublishPostOptions = {
  communityAddress?: string;
  onAbandonPost?: () => void;
  onDuplicateMediaRejected?: (error: string) => void;
  onPublishAccepted?: () => void;
  onPublishError?: (error: Error) => void;
  onPendingPost?: (accountCommentIndex: number, pendingPost: Comment) => void;
  /** The post form's shared store unless given; a publish apart from the form must not leave options in it. */
  publishPostStore?: PublishPostStore;
};

const usePublishPost = ({
  communityAddress,
  onAbandonPost,
  onDuplicateMediaRejected,
  onPublishAccepted,
  onPublishError,
  onPendingPost,
  publishPostStore: useStore = usePublishPostStore,
}: UsePublishPostOptions) => {
  const { author, title, content, link, gallery, flairs, spoiler, publishCommentOptions } = useStore(
    useShallow((state) => ({
      author: state.author,
      title: state.title || undefined,
      content: state.content || undefined,
      link: state.link || undefined,
      gallery: state.gallery,
      flairs: state.flairs,
      spoiler: state.spoiler || false,
      publishCommentOptions: state.publishCommentOptions,
    })),
  );

  const setPublishPostStore = useStore((state) => state.setPublishPostStore);
  const resetPublishPostStore = useStore((state) => state.resetPublishPostStore);
  const addChallenge = useChallengesStore((state) => state.addChallenge);
  const abandonPublishRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const [publishPostError, setPublishPostError] = useState<string | null>(null);
  const [pendingPublishRequestId, setPendingPublishRequestId] = useState(0);
  const [analyticsAttempt, setAnalyticsAttempt] = useState<PostingAnalyticsAttempt>();
  const startedPublishRequestIdRef = useRef(0);
  const { blockedReason } = usePublishAuthorDomainGuard();
  const { finishPendingPublishRequest, startPendingPublishRequest } = usePendingPublishRequest();
  const signTripcode = useSignTripcode();
  const { keepTripcode, forgetTripcode, onBeforeRepublish } = useTripcodeRepublish();
  const abandonCurrentPublish = useCallback(async () => {
    analyticsAttempt?.finish('post_cancelled');
    forgetTripcode();
    onAbandonPost?.();
    await abandonPublishRef.current?.();
  }, [analyticsAttempt, forgetTripcode, onAbandonPost]);

  const createBaseOptions = useCallback(() => {
    const baseOptions: Comment = {
      communityAddress,
      title,
      content,
      link,
      gallery,
      flairs,
      spoiler,
      ...(publishCommentOptions.challengeRequest ? { challengeRequest: publishCommentOptions.challengeRequest } : {}),
    };

    const displayName = author?.displayName;
    if (displayName) {
      baseOptions.author = { displayName };
    }

    return baseOptions;
  }, [author, content, flairs, gallery, link, spoiler, communityAddress, title, publishCommentOptions.challengeRequest]);

  const setPublishPostOptions = useCallback(
    (options: Partial<Comment>) => {
      const baseOptions = createBaseOptions();
      const sanitizedOptions = Object.entries(options).reduce((acc, [key, value]) => {
        acc[key] = value === '' ? undefined : value;
        return acc;
      }, {} as Partial<Comment>);

      const { communityAddress: nextCommunityAddress, ...restOptions } = sanitizedOptions;
      const resolvedCommunityAddress = nextCommunityAddress ?? baseOptions.communityAddress;
      const newOptions = {
        ...baseOptions,
        ...restOptions,
        ...(resolvedCommunityAddress ? { communityAddress: resolvedCommunityAddress } : {}),
      };
      setPublishPostStore(newOptions);
    },
    [createBaseOptions, setPublishPostStore],
  );

  const resetPublishPostOptions = useCallback(() => resetPublishPostStore(), [resetPublishPostStore]);

  const publishOptionsWithAbandon = useMemo(
    () => ({
      ...publishCommentOptions,
      // Only a post with a proof is rebuilt before its republish; any other keeps the hooks' own republish.
      ...(hasTripcodeProof(publishCommentOptions.author?.displayName) ? { onBeforeRepublish } : {}),
      onPendingComment: onPendingPost,
      onError: (error: Error) => {
        analyticsAttempt?.finish('post_publish_failed');
        forgetTripcode();
        onPublishError?.(error);
        publishCommentOptions.onError?.(error);
      },
      onChallengeVerification: async (challengeVerification: ChallengeVerification, comment: Comment) => {
        analyticsAttempt?.verify(challengeVerification);
        const duplicateMediaError = getDuplicateMediaChallengeError(challengeVerification);
        if (duplicateMediaError) {
          onDuplicateMediaRejected?.(duplicateMediaError);
          await abandonCurrentPublish();
          return;
        }
        if (challengeVerification.challengeSuccess === true) {
          forgetTripcode();
          onPublishAccepted?.();
        }
        publishCommentOptions.onChallengeVerification?.(challengeVerification, comment);
      },
      onChallenge: async (...args: any[]) => {
        analyticsAttempt?.challenge();
        addChallenge(args, abandonCurrentPublish);
      },
    }),
    [
      abandonCurrentPublish,
      addChallenge,
      analyticsAttempt,
      forgetTripcode,
      onBeforeRepublish,
      onDuplicateMediaRejected,
      onPendingPost,
      onPublishAccepted,
      onPublishError,
      publishCommentOptions,
    ],
  );

  const { index, publishComment, abandonPublish } = usePublishComment(publishOptionsWithAbandon);
  abandonPublishRef.current = abandonPublish;

  // A publish error describes the inputs it was raised for; clear it as soon as any of them changes.
  const publishPostErrorInputs = [author?.displayName, blockedReason, communityAddress, content, flairs, gallery, link, spoiler, title];
  const [publishPostErrorInputsSnapshot, setPublishPostErrorInputsSnapshot] = useState(publishPostErrorInputs);
  if (publishPostErrorInputs.some((value, index) => !Object.is(value, publishPostErrorInputsSnapshot[index]))) {
    setPublishPostErrorInputsSnapshot(publishPostErrorInputs);
    setPublishPostError(null);
  }

  const startPublishPost = useCallback(async () => {
    if (blockedReason) {
      analyticsAttempt?.finish('post_validation_failed');
      forgetTripcode();
      const message = getPublishAuthorDomainErrorMessage(blockedReason);
      setPublishPostError(message);
      // A caller that is not showing this hook's error (the pending upload publisher) still hears it.
      onPublishError?.(new Error(message));
      return;
    }

    setPublishPostError(null);
    try {
      await publishComment();
    } catch (error) {
      analyticsAttempt?.finish('post_publish_failed');
      forgetTripcode();
      throw error;
    }
  }, [analyticsAttempt, blockedReason, forgetTripcode, onPublishError, publishComment]);

  useEffect(() => {
    if (pendingPublishRequestId === 0 || pendingPublishRequestId === startedPublishRequestIdRef.current) {
      return;
    }

    const requestId = pendingPublishRequestId;
    startedPublishRequestIdRef.current = requestId;
    void startPublishPost()
      .catch(() => undefined)
      .finally(() => finishPendingPublishRequest(requestId));
  }, [finishPendingPublishRequest, pendingPublishRequestId, startPublishPost]);

  // A tripcode's proof signs the post's final options, so it is added once they are in the store, from an
  // effect like the publish itself, and the post is then published from the render that sees the proof.
  const [pendingTripcodeRequestId, setPendingTripcodeRequestId] = useState(0);
  const startedTripcodeRequestIdRef = useRef(0);
  // Each request's password, kept out of state and taken out once its signing starts; a signed post's
  // password is then kept by useTripcodeRepublish until the board accepts the post.
  const tripcodeSecretsRef = useRef(new Map<number, TripcodeSecret>());
  // A form closed while its key was derived drops the post, and its reset store must stay reset.
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pendingTripcodeRequestId === 0 || pendingTripcodeRequestId === startedTripcodeRequestIdRef.current) {
      return;
    }

    const requestId = pendingTripcodeRequestId;
    startedTripcodeRequestIdRef.current = requestId;
    const tripcodeSecret = tripcodeSecretsRef.current.get(requestId);
    tripcodeSecretsRef.current.delete(requestId);
    if (!tripcodeSecret) {
      finishPendingPublishRequest(requestId);
      return;
    }
    signTripcode({
      secret: tripcodeSecret,
      readOptions: () => useStore.getState().publishCommentOptions,
      writeOptions: (options) => {
        keepTripcode({ displayName: options.displayName, secret: tripcodeSecret, name: options.author?.displayName });
        useStore.getState().setPublishPostStore(options);
      },
      isActive: () => isMountedRef.current,
    })
      .then((signed) => {
        if (signed) {
          setPendingPublishRequestId(requestId);
          return;
        }
        analyticsAttempt?.finish('post_cancelled');
        finishPendingPublishRequest(requestId);
      })
      .catch((error: unknown) => {
        analyticsAttempt?.finish('post_validation_failed');
        const message = error instanceof Error ? error.message : String(error);
        setPublishPostError(message);
        onPublishError?.(new Error(message));
        finishPendingPublishRequest(requestId);
      });
  }, [analyticsAttempt, finishPendingPublishRequest, keepTripcode, onPublishError, pendingTripcodeRequestId, signTripcode, useStore]);

  const publishPost = useCallback(
    (options?: Partial<Comment>, attempt?: PostingAnalyticsAttempt, tripcodeSecret?: TripcodeSecret) => {
      const pendingRequest = startPendingPublishRequest();
      if (!pendingRequest.started) {
        return pendingRequest.request.promise;
      }

      if (tripcodeSecret) {
        setAnalyticsAttempt(attempt);
        if (options) setPublishPostOptions(options);
        tripcodeSecretsRef.current.set(pendingRequest.request.id, tripcodeSecret);
        setPendingTripcodeRequestId(pendingRequest.request.id);
        return pendingRequest.request.promise;
      }

      if (options || attempt || analyticsAttempt) {
        setAnalyticsAttempt(attempt);
        if (options) setPublishPostOptions(options);
        setPendingPublishRequestId(pendingRequest.request.id);
        return pendingRequest.request.promise;
      }

      void startPublishPost()
        .catch(() => undefined)
        .finally(() => finishPendingPublishRequest(pendingRequest.request.id));
      return pendingRequest.request.promise;
    },
    [analyticsAttempt, finishPendingPublishRequest, setPublishPostOptions, startPendingPublishRequest, startPublishPost],
  );

  return {
    setPublishPostOptions,
    resetPublishPostOptions,
    postIndex: index,
    publishPost,
    publishPostError,
    publishPostOptions: publishCommentOptions,
  };
};

export default usePublishPost;
