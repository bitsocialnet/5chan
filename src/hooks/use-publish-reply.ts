import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChallengeVerification, Comment, useAccount, usePublishComment } from '@bitsocial/bitsocial-react-hooks';
import { useShallow } from 'zustand/react/shallow';
import { useDirectories } from './use-directories';
import usePublishReplyStore from '../stores/use-publish-reply-store';
import usePostNumberStore, { getScopedNumberToCidMap } from '../stores/use-post-number-store';
import { filterSameThreadQuotedCids, getQuotedCidsFromContent, mergeQuotedCids } from '../lib/utils/reply-quote-utils';
import { extractUnresolvedExternalQuoteReferences, getExternalQuoteStatusMessage } from '../lib/utils/external-quote-utils';
import { resolveExternalQuoteTarget } from '../lib/utils/external-quote-resolver';
import useChallengesStore from '../stores/use-challenges-store';
import usePublishAuthorDomainGuard, { getPublishAuthorDomainErrorMessage } from './use-publish-author-domain-guard';
import usePendingPublishRequest from './use-pending-publish-request';
import useSignTripcode from './use-sign-tripcode';
import useTripcodeRepublish from './use-tripcode-republish';
import { hasTripcodeProof, type TripcodeSecret } from '../lib/utils/tripcode-utils';
import type { PostingAnalyticsAttempt } from '../lib/posting-analytics';

type UsePublishReplyOptions = {
  cid: string;
  communityAddress?: string;
  postCid?: string;
};

const usePublishReply = ({ cid, communityAddress, postCid }: UsePublishReplyOptions) => {
  const { t } = useTranslation();
  const parentCid = cid;
  const account = useAccount();
  const directories = useDirectories();

  const { author, content, link, gallery, flairs, spoiler, publishCommentOptions } = usePublishReplyStore(
    useShallow((state) => ({
      author: state.author[parentCid],
      content: state.content[parentCid] || undefined,
      link: state.link[parentCid] || undefined,
      gallery: state.gallery[parentCid],
      flairs: state.flairs[parentCid],
      spoiler: state.spoiler[parentCid] || false,
      publishCommentOptions: state.publishCommentOptions[parentCid],
    })),
  );

  const setPublishReplyStore = usePublishReplyStore((state) => state.setPublishReplyStore);
  const resetPublishReplyStore = usePublishReplyStore((state) => state.resetPublishReplyStore);
  const addChallenge = useChallengesStore((state) => state.addChallenge);
  const { blockedReason } = usePublishAuthorDomainGuard();
  const abandonPublishRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const startedPublishRequestIdRef = useRef(0);
  const [resolvedExternalQuotedCids, setResolvedExternalQuotedCids] = useState<string[] | undefined>();
  const [pendingPublishRequestId, setPendingPublishRequestId] = useState(0);
  const [analyticsAttempt, setAnalyticsAttempt] = useState<PostingAnalyticsAttempt>();
  const [pendingSyncedPublishRequestId, setPendingSyncedPublishRequestId] = useState(0);
  const startedSyncedPublishRequestIdRef = useRef(0);
  const [isResolvingExternalQuotes, setIsResolvingExternalQuotes] = useState(false);
  const [publishReplyError, setPublishReplyError] = useState<string | null>(null);
  const [publishReplyStateMessage, setPublishReplyStateMessage] = useState<string | null>(null);
  const { finishPendingPublishRequest, startPendingPublishRequest } = usePendingPublishRequest();
  const signTripcode = useSignTripcode();
  const { keepTripcode, forgetTripcode, onBeforeRepublish } = useTripcodeRepublish();
  const tripcodeSecretsRef = useRef(new Map<number, TripcodeSecret>());
  // A reply form closed while its key was derived drops the reply.
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const abandonCurrentPublish = useCallback(async () => {
    analyticsAttempt?.finish('post_cancelled');
    forgetTripcode();
    await abandonPublishRef.current?.();
  }, [analyticsAttempt, forgetTripcode]);

  const createBaseOptions = useCallback(() => {
    const baseOptions: Comment = {
      communityAddress,
      parentCid,
      postCid: postCid ?? parentCid,
      content,
      link,
      gallery,
      flairs,
      spoiler,
      ...(publishCommentOptions?.challengeRequest ? { challengeRequest: publishCommentOptions.challengeRequest } : {}),
    };

    const displayName = author?.displayName;
    if (displayName) {
      baseOptions.author = { displayName };
    }

    return baseOptions;
  }, [author, content, flairs, gallery, link, parentCid, postCid, spoiler, communityAddress, publishCommentOptions?.challengeRequest]);

  const setPublishReplyOptions = useCallback(
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
      setPublishReplyStore(newOptions);
    },
    [createBaseOptions, setPublishReplyStore],
  );

  const resetPublishReplyOptions = useCallback(() => resetPublishReplyStore(parentCid), [parentCid, resetPublishReplyStore]);

  const scopedNumberToCid = usePostNumberStore(useShallow((state) => getScopedNumberToCidMap(state.numberToCid, communityAddress)));
  const cidToPostCid = usePostNumberStore((state) => state.cidToPostCid);
  const threadPostCid = postCid ?? parentCid;
  const quotedCids = useMemo(() => getQuotedCidsFromContent(content, scopedNumberToCid), [content, scopedNumberToCid]);
  const unresolvedExternalQuoteReferences = useMemo(
    () =>
      extractUnresolvedExternalQuoteReferences({
        content,
        scopedNumberToCid,
        communityAddress,
      }),
    [content, scopedNumberToCid, communityAddress],
  );
  const publishResolvableQuoteReferences = useMemo(
    () => unresolvedExternalQuoteReferences.filter((reference) => reference.kind === 'same-board'),
    [unresolvedExternalQuoteReferences],
  );

  const mergedQuotedCids = useMemo(() => {
    const merged = new Set<string>();

    for (const cid of quotedCids ?? []) {
      merged.add(cid);
    }

    for (const cid of resolvedExternalQuotedCids ?? []) {
      merged.add(cid);
    }

    return merged.size > 0 ? [...merged] : undefined;
  }, [quotedCids, resolvedExternalQuotedCids]);

  const mergedPublishOptions = useMemo(() => {
    // Filter the FINAL payload so a reply only ever publishes same-thread quotedCids, even for any
    // that arrived via stored publishCommentOptions. The protocol rejects cross-thread quotes
    // (ERR_QUOTED_CID_NOT_UNDER_POST); cross-thread quotelinks still render/navigate via their text.
    const options = mergeQuotedCids(publishCommentOptions, mergedQuotedCids);
    if (!options?.quotedCids) {
      return options;
    }

    const sameThreadQuotedCids = filterSameThreadQuotedCids(options.quotedCids, cidToPostCid, threadPostCid);
    const { quotedCids: _crossThreadQuotedCids, ...optionsWithoutQuotedCids } = options;
    return sameThreadQuotedCids ? { ...optionsWithoutQuotedCids, quotedCids: sameThreadQuotedCids } : optionsWithoutQuotedCids;
  }, [publishCommentOptions, mergedQuotedCids, cidToPostCid, threadPostCid]);
  const publishOptionsWithAbandon = useMemo(
    () => ({
      ...mergedPublishOptions,
      // Only a reply with a proof is rebuilt before its republish; any other keeps the hooks' own republish.
      ...(hasTripcodeProof(mergedPublishOptions?.author?.displayName) ? { onBeforeRepublish } : {}),
      onError: (error: Error) => {
        analyticsAttempt?.finish('post_publish_failed');
        forgetTripcode();
        mergedPublishOptions?.onError?.(error);
      },
      onChallengeVerification: async (challengeVerification: ChallengeVerification, comment: Comment) => {
        analyticsAttempt?.verify(challengeVerification);
        if (challengeVerification.challengeSuccess === true) forgetTripcode();
        mergedPublishOptions?.onChallengeVerification?.(challengeVerification, comment);
      },
      onChallenge: async (...args: any[]) => {
        analyticsAttempt?.challenge();
        addChallenge(args, abandonCurrentPublish);
      },
    }),
    [abandonCurrentPublish, addChallenge, analyticsAttempt, forgetTripcode, mergedPublishOptions, onBeforeRepublish],
  );

  const { index, publishComment, abandonPublish } = usePublishComment(publishOptionsWithAbandon);
  abandonPublishRef.current = abandonPublish;

  // Resolved quotes, errors, and status messages describe the inputs they came from; clear them as soon as any of them changes.
  const publishReplyInputs = [blockedReason, content, communityAddress, flairs];
  const [publishReplyInputsSnapshot, setPublishReplyInputsSnapshot] = useState(publishReplyInputs);
  if (publishReplyInputs.some((value, index) => !Object.is(value, publishReplyInputsSnapshot[index]))) {
    setPublishReplyInputsSnapshot(publishReplyInputs);
    setResolvedExternalQuotedCids(undefined);
    setPublishReplyError(null);
    setPublishReplyStateMessage(null);
    setIsResolvingExternalQuotes(false);
  }

  useEffect(() => {
    if (pendingPublishRequestId === 0 || pendingPublishRequestId === startedPublishRequestIdRef.current) {
      return;
    }

    const requestId = pendingPublishRequestId;
    startedPublishRequestIdRef.current = requestId;
    void Promise.resolve()
      .then(() => publishComment())
      .catch(() => {
        analyticsAttempt?.finish('post_publish_failed');
        forgetTripcode();
      })
      .finally(() => finishPendingPublishRequest(requestId));
  }, [analyticsAttempt, finishPendingPublishRequest, forgetTripcode, pendingPublishRequestId, publishComment]);

  const preparePublishReply = useCallback(
    async (requestId: number) => {
      setPublishReplyError(null);
      // Taken out first, so no return below leaves the password in the map; a signed reply's password is
      // then kept by useTripcodeRepublish until the board accepts the reply.
      const tripcodeSecret = tripcodeSecretsRef.current.get(requestId);
      tripcodeSecretsRef.current.delete(requestId);

      if (blockedReason) {
        analyticsAttempt?.finish('post_validation_failed');
        setPublishReplyStateMessage(null);
        setPublishReplyError(getPublishAuthorDomainErrorMessage(blockedReason));
        finishPendingPublishRequest(requestId);
        return;
      }

      // A tripcode's proof signs the reply's final options, so it is added last, just before the publish.
      const publishWhenSigned = async () => {
        if (tripcodeSecret) {
          try {
            const signed = await signTripcode({
              secret: tripcodeSecret,
              readOptions: () => usePublishReplyStore.getState().publishCommentOptions[parentCid],
              writeOptions: (options) => {
                keepTripcode({ displayName: options.displayName, secret: tripcodeSecret, name: options.author?.displayName });
                usePublishReplyStore.getState().setPublishReplyStore({ ...options, parentCid });
              },
              isActive: () => isMountedRef.current,
            });
            if (!signed) {
              analyticsAttempt?.finish('post_cancelled');
              finishPendingPublishRequest(requestId);
              return;
            }
          } catch (error) {
            analyticsAttempt?.finish('post_validation_failed');
            setPublishReplyStateMessage(null);
            setPublishReplyError(error instanceof Error ? error.message : String(error));
            finishPendingPublishRequest(requestId);
            return;
          }
        }
        setPendingPublishRequestId(requestId);
      };

      if (publishResolvableQuoteReferences.length === 0) {
        setResolvedExternalQuotedCids(undefined);
        setPublishReplyStateMessage(null);
        await publishWhenSigned();
        return;
      }

      if (!account?.id) {
        analyticsAttempt?.finish('post_validation_failed');
        setPublishReplyError(t('external_quote_resolution_unavailable'));
        finishPendingPublishRequest(requestId);
        return;
      }

      setIsResolvingExternalQuotes(true);

      try {
        const resolvedCids = new Set<string>();

        for (const reference of publishResolvableQuoteReferences) {
          const resolvedTarget = await resolveExternalQuoteTarget({
            account,
            directories,
            onStatus: (status) => {
              setPublishReplyStateMessage(getExternalQuoteStatusMessage(t, status));
            },
            postNumbers: usePostNumberStore,
            reference,
          });

          if (!resolvedTarget?.cid) {
            analyticsAttempt?.finish('post_validation_failed');
            setPublishReplyError(
              t('external_quote_publish_missing', {
                interpolation: { escapeValue: false },
                quote: reference.raw,
              }),
            );
            finishPendingPublishRequest(requestId);
            return;
          }

          resolvedCids.add(resolvedTarget.cid);
        }

        setResolvedExternalQuotedCids(resolvedCids.size > 0 ? [...resolvedCids] : undefined);
        setPublishReplyStateMessage(null);
        await publishWhenSigned();
      } catch {
        analyticsAttempt?.finish('post_validation_failed');
        setPublishReplyError(t('external_quote_resolution_unavailable'));
        finishPendingPublishRequest(requestId);
      } finally {
        setIsResolvingExternalQuotes(false);
      }
    },
    [account, analyticsAttempt, blockedReason, directories, finishPendingPublishRequest, keepTripcode, parentCid, publishResolvableQuoteReferences, signTripcode, t],
  );

  const publishReply = useCallback(
    (options?: Partial<Comment>, attempt?: PostingAnalyticsAttempt, tripcodeSecret?: TripcodeSecret) => {
      const pendingRequest = startPendingPublishRequest();
      if (!pendingRequest.started) {
        return pendingRequest.request.promise;
      }
      if (tripcodeSecret) tripcodeSecretsRef.current.set(pendingRequest.request.id, tripcodeSecret);

      if (options || attempt || analyticsAttempt) {
        setAnalyticsAttempt(attempt);
        if (options) setPublishReplyOptions(options);
        setPendingSyncedPublishRequestId(pendingRequest.request.id);
        return pendingRequest.request.promise;
      }

      void preparePublishReply(pendingRequest.request.id).catch(() => finishPendingPublishRequest(pendingRequest.request.id));
      return pendingRequest.request.promise;
    },
    [analyticsAttempt, finishPendingPublishRequest, preparePublishReply, setPublishReplyOptions, startPendingPublishRequest],
  );

  useEffect(() => {
    if (pendingSyncedPublishRequestId === 0 || pendingSyncedPublishRequestId === startedSyncedPublishRequestIdRef.current) {
      return;
    }

    const requestId = pendingSyncedPublishRequestId;
    startedSyncedPublishRequestIdRef.current = requestId;
    void preparePublishReply(requestId).catch(() => finishPendingPublishRequest(requestId));
  }, [finishPendingPublishRequest, pendingSyncedPublishRequestId, preparePublishReply]);

  return {
    isResolvingExternalQuotes,
    publishReply,
    publishReplyError,
    publishReplyStateMessage,
    setPublishReplyOptions,
    resetPublishReplyOptions,
    replyIndex: index,
  };
};

export default usePublishReply;
