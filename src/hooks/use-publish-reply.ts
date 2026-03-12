import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Comment, useAccount, usePublishComment } from '@bitsocialnet/bitsocial-react-hooks';
import { useDirectories } from './use-directories';
import usePublishReplyStore from '../stores/use-publish-reply-store';
import usePostNumberStore from '../stores/use-post-number-store';
import { getQuotedCidsFromContent, mergeQuotedCids } from '../lib/utils/reply-quote-utils';
import { extractUnresolvedExternalQuoteReferences, getExternalQuoteStatusMessage } from '../lib/utils/external-quote-utils';
import { resolveExternalQuoteTarget } from '../lib/utils/external-quote-resolver';
import useChallengesStore from '../stores/use-challenges-store';

const usePublishReply = ({ cid, subplebbitAddress, postCid }: { cid: string; subplebbitAddress: string; postCid?: string }) => {
  const { t } = useTranslation();
  const parentCid = cid;
  const account = useAccount();
  const directories = useDirectories();

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
  const startedPublishRequestIdRef = useRef(0);
  const [resolvedExternalQuotedCids, setResolvedExternalQuotedCids] = useState<string[] | undefined>();
  const [pendingPublishRequestId, setPendingPublishRequestId] = useState(0);
  const [isResolvingExternalQuotes, setIsResolvingExternalQuotes] = useState(false);
  const [publishReplyError, setPublishReplyError] = useState<string | null>(null);
  const [publishReplyStateMessage, setPublishReplyStateMessage] = useState<string | null>(null);
  const abandonCurrentPublish = useCallback(async () => {
    await abandonPublishRef.current?.();
  }, []);

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
  const unresolvedExternalQuoteReferences = useMemo(
    () =>
      extractUnresolvedExternalQuoteReferences({
        content,
        scopedNumberToCid,
        subplebbitAddress,
      }),
    [content, scopedNumberToCid, subplebbitAddress],
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

  const mergedPublishOptions = useMemo(() => mergeQuotedCids(publishCommentOptions, mergedQuotedCids), [publishCommentOptions, mergedQuotedCids]);
  const publishOptionsWithAbandon = useMemo(
    () => ({
      ...mergedPublishOptions,
      onChallenge: async (...args: any[]) => {
        addChallenge(args, abandonCurrentPublish);
      },
    }),
    [abandonCurrentPublish, addChallenge, mergedPublishOptions],
  );

  const { index, publishComment, abandonPublish } = usePublishComment(publishOptionsWithAbandon);
  abandonPublishRef.current = abandonPublish;

  useEffect(() => {
    setResolvedExternalQuotedCids(undefined);
    setPublishReplyError(null);
    setPublishReplyStateMessage(null);
    setIsResolvingExternalQuotes(false);
  }, [content, subplebbitAddress]);

  useEffect(() => {
    if (pendingPublishRequestId === 0 || pendingPublishRequestId === startedPublishRequestIdRef.current) {
      return;
    }

    startedPublishRequestIdRef.current = pendingPublishRequestId;
    publishComment();
  }, [pendingPublishRequestId, publishComment]);

  const publishReply = useCallback(async () => {
    setPublishReplyError(null);

    if (publishResolvableQuoteReferences.length === 0) {
      setResolvedExternalQuotedCids(undefined);
      setPublishReplyStateMessage(null);
      setPendingPublishRequestId((requestId) => requestId + 1);
      return;
    }

    if (!account?.id) {
      setPublishReplyError(t('external_quote_resolution_unavailable'));
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
          reference,
        });

        if (!resolvedTarget?.cid) {
          setPublishReplyError(
            t('external_quote_publish_missing', {
              interpolation: { escapeValue: false },
              quote: reference.raw,
            }),
          );
          return;
        }

        resolvedCids.add(resolvedTarget.cid);
      }

      setResolvedExternalQuotedCids(resolvedCids.size > 0 ? [...resolvedCids] : undefined);
      setPublishReplyStateMessage(null);
      setPendingPublishRequestId((requestId) => requestId + 1);
    } catch {
      setPublishReplyError(t('external_quote_resolution_unavailable'));
    } finally {
      setIsResolvingExternalQuotes(false);
    }
  }, [account, directories, publishResolvableQuoteReferences, t]);

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
