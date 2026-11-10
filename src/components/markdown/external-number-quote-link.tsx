import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAccount, useComment } from '@bitsocial/bitsocial-react-hooks';
import { useDirectories } from '../../hooks/use-directories';
import useIsMobile from '../../hooks/use-is-mobile';
import { resolveExternalQuoteTarget } from '../../lib/utils/external-quote-resolver';
import { ExternalQuoteReference, getExternalQuoteBoardLabel, getExternalQuoteStatusMessage } from '../../lib/utils/external-quote-utils';
import { isUnavailableQuoteTarget } from '../../lib/utils/quote-link-utils';
import useExternalQuoteStatusStore from '../../stores/use-external-quote-status-store';
import usePostNumberStore from '../../stores/use-post-number-store';
import LoadingEllipsis from '../loading-ellipsis';
import postStyles from '../post-styles';
import { useQuotePreviewPost } from '../../hooks/use-quote-preview-post';
import styles from './markdown.module.css';

interface ExternalNumberQuoteLinkProps {
  isOP?: boolean;
  reference: ExternalQuoteReference;
}

type ResolvedExternalQuoteTarget = NonNullable<Awaited<ReturnType<typeof resolveExternalQuoteTarget>>>;

type PreviewState =
  | {
      kind: 'idle';
    }
  | {
      kind: 'loading';
      message: string;
    }
  | {
      kind: 'error';
      message: string;
    }
  | {
      kind: 'resolved';
      target: ResolvedExternalQuoteTarget;
    };

type PreviewPosition = {
  left: number;
  top: number;
};

// Counts quote clicks across every link, so a newer click supersedes one still being resolved.
let latestQuoteClick = 0;

const ExternalNumberQuoteLink = ({ isOP = false, reference }: ExternalNumberQuoteLinkProps) => {
  const { t } = useTranslation();
  const account = useAccount();
  const directories = useDirectories();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const renderQuotePreviewPost = useQuotePreviewPost();
  const setErrorStatus = useExternalQuoteStatusStore((state) => state.setErrorStatus);
  const [isResolving, setIsResolving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({ kind: 'idle' });
  const [previewPosition, setPreviewPosition] = useState<PreviewPosition | null>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  // Only a found target is kept: a quote not found yet may still propagate, so it is searched again.
  const resolvedTargetRef = useRef<ResolvedExternalQuoteTarget | undefined>(undefined);
  const resolutionPromiseRef = useRef<Promise<ResolvedExternalQuoteTarget | null> | null>(null);
  const previewOpenRef = useRef(false);
  const latestStatusMessageRef = useRef('');

  // A post number can resolve to a cid whose comment this page has not loaded (numbers registered by
  // a visited thread or by the reply search), so the preview fetches that comment by its cid. It waits
  // for the CommentUpdate (updatedAt), which carries deleted, removed and purged, before showing it.
  const previewTargetCid = previewState.kind === 'resolved' && !previewState.target.comment ? previewState.target.cid : undefined;
  const previewTargetComment = useComment({ commentCid: previewTargetCid, onlyIfCached: !previewTargetCid });
  const previewComment =
    previewState.kind === 'resolved'
      ? (previewState.target.comment ?? (typeof previewTargetComment?.updatedAt === 'number' ? previewTargetComment : undefined))
      : undefined;
  const hasPreviewComment = Boolean(previewComment);

  const boardLabel = getExternalQuoteBoardLabel(reference, directories);
  const linkLabel = isOP ? `${reference.raw} (OP)` : reference.raw;

  const updatePreviewPosition = useCallback(
    (anchor: HTMLElement | null) => {
      if (!anchor || isMobile) {
        return;
      }

      const padding = 10;
      const rect = anchor.getBoundingClientRect();
      const previewWidth = previewRef.current?.offsetWidth ?? Math.min(360, window.innerWidth - padding * 2);
      const previewHeight = previewRef.current?.offsetHeight ?? 0;
      const shouldPlaceLeft = rect.right + previewWidth + padding > window.innerWidth && rect.left - previewWidth - padding >= padding;
      const left = shouldPlaceLeft ? Math.max(padding, rect.left - previewWidth - 8) : Math.min(window.innerWidth - previewWidth - padding, rect.right + 8);
      const top = Math.min(Math.max(padding, rect.top - 8), Math.max(padding, window.innerHeight - previewHeight - padding));

      setPreviewPosition({ left, top });
    },
    [isMobile],
  );

  useEffect(() => {
    if (!isPreviewOpen || isMobile) {
      return;
    }

    const reposition = () => updatePreviewPosition(anchorRef.current);
    reposition();

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [hasPreviewComment, isMobile, isPreviewOpen, previewState.kind, updatePreviewPosition]);

  const getInitialSearchMessage = () =>
    getExternalQuoteStatusMessage(t, {
      boardLabel,
      phase: 'search-board',
      quoteDisplay: reference.raw,
    });

  const getUnavailableMessage = () => t('external_quote_unavailable');
  const getCannotResolveMessage = () =>
    t('external_quote_cannot_resolve', {
      board: boardLabel,
      interpolation: { escapeValue: false },
      quote: reference.raw,
    });

  const resolveTarget = async ({ updatePreview }: { updatePreview: boolean }) => {
    if (!account?.id) {
      throw new Error('Missing active account while resolving external quote');
    }

    if (resolvedTargetRef.current) {
      return resolvedTargetRef.current;
    }

    if (!resolutionPromiseRef.current) {
      resolutionPromiseRef.current = resolveExternalQuoteTarget({
        account,
        directories,
        onStatus: (status) => {
          const message = getExternalQuoteStatusMessage(t, status);
          latestStatusMessageRef.current = message;

          if (updatePreview && previewOpenRef.current) {
            setPreviewState({ kind: 'loading', message });
          }
        },
        postNumbers: usePostNumberStore,
        reference,
      }).then((target) => {
        resolvedTargetRef.current = target ?? undefined;
        return target;
      });
    }

    try {
      const target = await resolutionPromiseRef.current;
      resolutionPromiseRef.current = null;
      return target;
    } catch (error) {
      resolutionPromiseRef.current = null;
      throw error;
    }
  };

  const handleMouseEnter = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (isMobile) {
      return;
    }

    anchorRef.current = e.currentTarget;
    previewOpenRef.current = true;
    setIsPreviewOpen(true);
    updatePreviewPosition(e.currentTarget);

    const showTarget = (target: ResolvedExternalQuoteTarget) =>
      setPreviewState(target.isUnavailable ? { kind: 'error', message: getUnavailableMessage() } : { kind: 'resolved', target });

    if (resolvedTargetRef.current) {
      showTarget(resolvedTargetRef.current);
      return;
    }

    setPreviewState({ kind: 'loading', message: latestStatusMessageRef.current || getInitialSearchMessage() });

    let target: ResolvedExternalQuoteTarget | null;

    try {
      target = await resolveTarget({ updatePreview: true });
    } catch {
      if (previewOpenRef.current) {
        setPreviewState({ kind: 'error', message: t('external_quote_resolution_unavailable') });
      }
      return;
    }

    if (!previewOpenRef.current) {
      return;
    }

    if (!target) {
      setPreviewState({ kind: 'error', message: getCannotResolveMessage() });
      return;
    }

    showTarget(target);
  };

  const handleMouseLeave = () => {
    previewOpenRef.current = false;
    setIsPreviewOpen(false);
    setPreviewPosition(null);
  };

  const openExternalQuote = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (isResolving) {
      return;
    }

    if (!account?.id) {
      setErrorStatus(t('external_quote_resolution_unavailable'));
      return;
    }

    setIsResolving(true);

    // The search can take minutes, so it only navigates or reports an error while this is still the
    // latest quote click and the user is still on the page they clicked it from. The link itself can
    // unmount before then (a same-board quote turns into a regular one once its number is found).
    const click = ++latestQuoteClick;
    const clickedFromUrl = window.location.href;
    const isClickCurrent = () => click === latestQuoteClick && window.location.href === clickedFromUrl;

    const finishWithError = (message: string) => {
      if (isClickCurrent()) {
        setErrorStatus(message);
      }
      setIsResolving(false);
    };

    let target: ResolvedExternalQuoteTarget | null;

    try {
      target = await resolveTarget({ updatePreview: false });
    } catch {
      finishWithError(getCannotResolveMessage());
      return;
    }

    if (!isClickCurrent()) {
      setIsResolving(false);
      return;
    }

    if (!target) {
      finishWithError(getCannotResolveMessage());
      return;
    }

    if (target.isUnavailable) {
      finishWithError(getUnavailableMessage());
      return;
    }

    setIsResolving(false);
    navigate(target.route);
  };

  const previewContent =
    previewState.kind === 'idle' ? null : previewState.kind === 'resolved' ? (
      !previewComment ? (
        <div className={styles.externalQuotePreviewState}>
          <LoadingEllipsis string={t('loading_post')} />
        </div>
      ) : isUnavailableQuoteTarget(previewComment) ? (
        <div className={`${styles.externalQuotePreviewState} ${styles.externalQuotePreviewError}`}>{getUnavailableMessage()}</div>
      ) : renderQuotePreviewPost ? (
        renderQuotePreviewPost({ post: previewComment, showReplies: false })
      ) : null
    ) : previewState.kind === 'loading' ? (
      <div className={styles.externalQuotePreviewState}>
        <LoadingEllipsis string={previewState.message} />
      </div>
    ) : (
      <div className={`${styles.externalQuotePreviewState} ${styles.externalQuotePreviewError}`}>{previewState.message}</div>
    );
  const previewClassName =
    previewComment && !previewComment.parentCid ? `${postStyles.replyQuotePreview} ${postStyles.replyQuotePreviewOp}` : postStyles.replyQuotePreview;

  return (
    <>
      <a
        aria-busy={isResolving || undefined}
        className={isResolving ? styles.inlineQuoteLinkResolving : undefined}
        href={`#/${boardLabel}`}
        onClick={openExternalQuote}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        ref={anchorRef}
      >
        {linkLabel}
      </a>
      {!isMobile &&
        isPreviewOpen &&
        previewPosition &&
        previewContent &&
        createPortal(
          <div
            className={previewClassName}
            data-thread-scroll-preview='true'
            ref={previewRef}
            style={{ left: previewPosition.left, position: 'fixed', top: previewPosition.top, zIndex: 30 }}
          >
            {previewContent}
          </div>,
          document.body,
        )}
    </>
  );
};

export default ExternalNumberQuoteLink;
