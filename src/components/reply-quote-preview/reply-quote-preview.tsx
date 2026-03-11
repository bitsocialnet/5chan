import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Comment, useAccount } from '@bitsocialnet/bitsocial-react-hooks';
import { useFloating, offset, shift, size, autoUpdate, Placement } from '@floating-ui/react';
import { useDirectories } from '../../hooks/use-directories';
import { getBoardPath } from '../../lib/utils/route-utils';
import { formatQuoteNumber, getQuoteTargetAvailability, shouldShowFloatingQuotePreview } from '../../lib/utils/quote-link-utils';
import { findPreferredScrollTarget, getThreadTopNavigationState, scrollThreadContainerToTop } from '../../lib/utils/thread-scroll-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import styles from '../../views/post/post.module.css';
import { Post } from '../../views/post';

interface ReplyQuotePreviewProps {
  isBacklinkReply?: boolean;
  backlinkReply?: Comment;
  isQuotelinkReply?: boolean;
  quotelinkReply?: Comment;
  quotelinkNumber?: number;
  isQuotelinkUnavailable?: boolean;
  isOP?: boolean;
  showTrailingBreak?: boolean;
}

const handleQuoteHover = (cid: string, onElementOutOfView: () => void) => {
  const targetElements = document.querySelectorAll(`[data-cid="${cid}"]`);
  const isOpElement = (element: HTMLElement) => element.getAttribute('data-post-cid') === cid;

  const isInViewport = (element: HTMLElement) => {
    const bounding = element.getBoundingClientRect();
    return (
      bounding.top >= 0 &&
      bounding.left >= 0 &&
      bounding.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      bounding.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };

  let anyInView = false;

  targetElements.forEach((element) => {
    const htmlElement = element as HTMLElement;
    if (isInViewport(htmlElement)) {
      // Never apply quote-hover highlight styles to OP cards.
      if (isOpElement(htmlElement)) {
        htmlElement.classList.remove('highlight', 'double-highlight');
        anyInView = true;
        return;
      }

      const hasHighlight = Array.from(htmlElement.classList).some((className) => className.includes('highlight') && !className.includes('double-highlight'));
      if (hasHighlight) {
        htmlElement.classList.remove('highlight');
        htmlElement.classList.add('double-highlight');
      } else {
        htmlElement.classList.remove('double-highlight');
        htmlElement.classList.add('highlight');
      }
      anyInView = true;
    } else {
      // If not in view, remove both classes
      htmlElement.classList.remove('highlight', 'double-highlight');
    }
  });

  if (!anyInView) {
    onElementOutOfView();
  }
};

const getInPageScrollTarget = (selector: string) => findPreferredScrollTarget(selector, '[data-thread-scroll-preview="true"]');

const scrollToReplyOnPage = (cid: string) => {
  const el = getInPageScrollTarget(`[data-cid="${cid}"][data-post-cid]`);
  if (!el) return false;
  document.querySelectorAll('.scroll-highlight').forEach((prev) => prev.classList.remove('scroll-highlight'));
  el.scrollIntoView({ behavior: 'auto', block: 'center' });
  el.classList.add('scroll-highlight');
  return true;
};

const DesktopQuotePreview = ({
  backlinkReply,
  quotelinkReply,
  quotelinkNumber,
  isBacklinkReply,
  isQuotelinkReply,
  isQuotelinkUnavailable,
  isOP,
  showTrailingBreak = true,
}: ReplyQuotePreviewProps) => {
  const [hoveredCid, setHoveredCid] = useState<string | null>(null);
  const [outOfViewCid, setOutOfViewCid] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement>('right');
  const availableWidthRef = useRef<number>(0);
  const directories = useDirectories();

  const { refs, floatingStyles, update } = useFloating({
    placement,
    middleware: [
      shift({ padding: 10 }),
      offset({ mainAxis: placement === 'right' ? 8 : 4 }),
      size({
        apply({ availableWidth, elements }) {
          availableWidthRef.current = availableWidth;
          if (availableWidth >= 250) {
            elements.floating.style.maxWidth = `${availableWidth - 12}px`;
          } else if (placement === 'right') {
            setPlacement('left');
          }
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    const handleResize = () => {
      const availableWidth = availableWidthRef.current;
      if (availableWidth >= 250) {
        setPlacement('right');
      } else {
        setPlacement('left');
      }
      update();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [update]);

  const navigate = useNavigate();
  const location = useLocation();

  const isOnThreadPage = location.pathname.includes('/thread/');

  const handleClick = (e: React.MouseEvent, cid: string | undefined, subplebbitAddress: string | undefined, isOpQuote = false) => {
    e.preventDefault();
    if (cid && subplebbitAddress) {
      const boardPath = getBoardPath(subplebbitAddress, directories);
      const threadRoute = `/${boardPath}/thread/${cid}`;
      if (isOpQuote) {
        if (isOnThreadPage && scrollThreadContainerToTop(cid)) return;
        navigate(threadRoute, { state: getThreadTopNavigationState(cid) });
        return;
      }
      if (isOnThreadPage && scrollToReplyOnPage(cid)) return;
      navigate(threadRoute);
    }
  };

  const handleMouseOver = (cid: string | undefined) => {
    if (!cid) return;

    handleQuoteHover(cid, () => setOutOfViewCid(cid));
    setHoveredCid(cid);
  };

  const handleMouseLeave = (cid: string | null) => {
    if (cid) {
      const targetElements = document.querySelectorAll(`[data-cid="${cid}"]`);
      targetElements.forEach((element) => {
        element.classList.remove('highlight');
        element.classList.remove('double-highlight');
      });
    }
    setHoveredCid(null);
    setOutOfViewCid(null);
  };

  const backlinkBoardPath = backlinkReply?.subplebbitAddress ? getBoardPath(backlinkReply.subplebbitAddress, directories) : undefined;
  const backlinkRoute = backlinkReply?.cid ? (backlinkBoardPath ? `/${backlinkBoardPath}/thread/${backlinkReply.cid}` : `/thread/${backlinkReply.cid}`) : '#';

  const replyBacklink = (
    <>
      <Link
        className={styles.backlink}
        to={backlinkRoute}
        ref={refs.setReference}
        onMouseOver={() => handleMouseOver(backlinkReply?.cid)}
        onMouseLeave={() => handleMouseLeave(backlinkReply?.cid)}
        onClick={(e) => handleClick(e, backlinkReply?.cid, backlinkReply?.subplebbitAddress)}
      >
        {'>>'}
        {backlinkReply?.number ?? '?'}
      </Link>
      {hoveredCid === backlinkReply?.cid &&
        outOfViewCid === backlinkReply?.cid &&
        createPortal(
          <div className={styles.replyQuotePreview} data-thread-scroll-preview='true' ref={refs.setFloating} style={floatingStyles}>
            <Post post={backlinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  const account = useAccount();

  const resolvedQuotelinkNumber = quotelinkReply?.number ?? quotelinkNumber;
  const resolvedQuotelinkCid = quotelinkReply?.cid;
  const resolvedQuotelinkSubplebbitAddress = quotelinkReply?.subplebbitAddress;
  const quoteTargetAvailability = getQuoteTargetAvailability(quotelinkReply);
  const quotelinkUnavailable = Boolean(isQuotelinkUnavailable || quoteTargetAvailability === 'unavailable');
  const quotelinkPendingResolution = !quotelinkUnavailable && quoteTargetAvailability === 'unresolved';
  const quotelinkClassName = quotelinkUnavailable ? `${styles.quoteLink} ${styles.quoteLinkUnavailable}` : styles.quoteLink;
  const quotelinkBoardPath = quotelinkReply?.subplebbitAddress ? getBoardPath(quotelinkReply.subplebbitAddress, directories) : undefined;
  const quotelinkRoute = quotelinkReply?.cid ? (quotelinkBoardPath ? `/${quotelinkBoardPath}/thread/${quotelinkReply.cid}` : `/thread/${quotelinkReply.cid}`) : '#';
  const shouldShowQuotelinkPreview = shouldShowFloatingQuotePreview({
    hoveredCid,
    outOfViewCid,
    quoteCid: resolvedQuotelinkCid,
    isUnavailable: quotelinkUnavailable,
  });
  const quotelinkLabel = (
    <>
      {formatQuoteNumber(resolvedQuotelinkNumber)}
      {isOP && ' (OP)'}
      {quotelinkReply?.author?.address === account?.author?.address && ' (You)'}
    </>
  );

  const replyQuotelink = (
    <>
      {quotelinkUnavailable ? (
        <span className={quotelinkClassName}>{quotelinkLabel}</span>
      ) : quotelinkPendingResolution ? (
        <span className={styles.quoteLink}>{quotelinkLabel}</span>
      ) : (
        <Link
          to={quotelinkRoute}
          ref={refs.setReference}
          className={quotelinkClassName}
          onMouseOver={() => handleMouseOver(resolvedQuotelinkCid)}
          onMouseLeave={() => handleMouseLeave(resolvedQuotelinkCid)}
          onClick={(e) => handleClick(e, resolvedQuotelinkCid, resolvedQuotelinkSubplebbitAddress, !!isOP)}
        >
          {quotelinkLabel}
        </Link>
      )}
      {showTrailingBreak && <br />}
      {shouldShowQuotelinkPreview &&
        createPortal(
          <div className={styles.replyQuotePreview} data-thread-scroll-preview='true' ref={refs.setFloating} style={floatingStyles}>
            <Post post={quotelinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  return isBacklinkReply ? replyBacklink : isQuotelinkReply && replyQuotelink;
};

const MobileQuotePreview = ({
  backlinkReply,
  quotelinkReply,
  quotelinkNumber,
  isBacklinkReply,
  isQuotelinkReply,
  isQuotelinkUnavailable,
  isOP,
  showTrailingBreak = true,
}: ReplyQuotePreviewProps) => {
  const [hoveredCid, setHoveredCid] = useState<string | null>(null);
  const [outOfViewCid, setOutOfViewCid] = useState<string | null>(null);
  const directories = useDirectories();

  const { refs, floatingStyles, update } = useFloating({
    placement: 'bottom',
    middleware: [shift({ padding: isBacklinkReply ? 5 : 10 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    // Create a stable function reference for proper cleanup
    const handleResize = () => update();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [update]);

  const navigate = useNavigate();
  const location = useLocation();
  const isOnThreadPage = location.pathname.includes('/thread/');

  const handleClick = (e: React.MouseEvent, cid: string | undefined, subplebbitAddress: string | undefined, isOpQuote = false) => {
    e.preventDefault();
    if (cid && subplebbitAddress) {
      const boardPath = getBoardPath(subplebbitAddress, directories);
      const threadRoute = `/${boardPath}/thread/${cid}`;
      if (isOpQuote) {
        if (isOnThreadPage && scrollThreadContainerToTop(cid)) return;
        navigate(threadRoute, { state: getThreadTopNavigationState(cid) });
        return;
      }
      navigate(threadRoute);
    }
  };

  const handleMouseOver = (cid: string | undefined) => {
    if (!cid) return;

    handleQuoteHover(cid, () => setOutOfViewCid(cid));
    setHoveredCid(cid);
  };

  const handleMouseLeave = (cid: string | null) => {
    if (cid) {
      const targetElements = document.querySelectorAll(`[data-cid="${cid}"]`);
      targetElements.forEach((element) => {
        element.classList.remove('highlight');
        element.classList.remove('double-highlight');
      });
    }
    setHoveredCid(null);
    setOutOfViewCid(null);
  };

  const replyBacklink = (
    <>
      <span
        className={styles.backlink}
        ref={refs.setReference}
        onMouseOver={() => handleMouseOver(backlinkReply?.cid)}
        onMouseLeave={() => handleMouseLeave(backlinkReply?.cid)}
      >
        {`>>${backlinkReply?.number ?? '?'}`}
      </span>
      {backlinkReply?.number &&
        (() => {
          const backlinkBoardPath = backlinkReply?.subplebbitAddress ? getBoardPath(backlinkReply.subplebbitAddress, directories) : undefined;
          const backlinkRoute = backlinkReply?.cid ? (backlinkBoardPath ? `/${backlinkBoardPath}/thread/${backlinkReply.cid}` : `/thread/${backlinkReply.cid}`) : '#';
          return (
            <Link to={backlinkRoute} className={styles.backlinkHash} onClick={(e) => handleClick(e, backlinkReply?.cid, backlinkReply?.subplebbitAddress)}>
              {' '}
              #
            </Link>
          );
        })()}
      {hoveredCid === backlinkReply?.cid &&
        outOfViewCid === backlinkReply?.cid &&
        createPortal(
          <div className={styles.replyQuotePreview} data-thread-scroll-preview='true' ref={refs.setFloating} style={floatingStyles}>
            <Post post={backlinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  const account = useAccount();
  const resolvedQuotelinkNumber = quotelinkReply?.number ?? quotelinkNumber;
  const resolvedQuotelinkCid = quotelinkReply?.cid;
  const resolvedQuotelinkSubplebbitAddress = quotelinkReply?.subplebbitAddress;
  const quoteTargetAvailability = getQuoteTargetAvailability(quotelinkReply);
  const quotelinkUnavailable = Boolean(isQuotelinkUnavailable || quoteTargetAvailability === 'unavailable');
  const quotelinkPendingResolution = !quotelinkUnavailable && quoteTargetAvailability === 'unresolved';
  const quotelinkClassName = quotelinkUnavailable ? `${styles.quoteLink} ${styles.quoteLinkUnavailable}` : styles.quoteLink;
  const shouldShowQuotelinkPreview = shouldShowFloatingQuotePreview({
    hoveredCid,
    outOfViewCid,
    quoteCid: resolvedQuotelinkCid,
    isUnavailable: quotelinkUnavailable,
  });

  const replyQuotelink = (
    <>
      <span
        ref={quotelinkUnavailable || quotelinkPendingResolution ? undefined : refs.setReference}
        className={quotelinkPendingResolution ? styles.quoteLink : quotelinkClassName}
        onMouseOver={quotelinkUnavailable || quotelinkPendingResolution ? undefined : () => handleMouseOver(resolvedQuotelinkCid)}
        onMouseLeave={quotelinkUnavailable || quotelinkPendingResolution ? undefined : () => handleMouseLeave(resolvedQuotelinkCid)}
      >
        {formatQuoteNumber(resolvedQuotelinkNumber)}
        {isOP && ' (OP)'}
        {quotelinkReply?.author?.address === account?.author?.address && ' (You)'}
      </span>
      {!quotelinkUnavailable &&
        !quotelinkPendingResolution &&
        resolvedQuotelinkNumber &&
        (() => {
          const quotelinkBoardPath = resolvedQuotelinkSubplebbitAddress ? getBoardPath(resolvedQuotelinkSubplebbitAddress, directories) : undefined;
          const quotelinkRoute = resolvedQuotelinkCid
            ? quotelinkBoardPath
              ? `/${quotelinkBoardPath}/thread/${resolvedQuotelinkCid}`
              : `/thread/${resolvedQuotelinkCid}`
            : '#';
          return (
            <Link className={quotelinkClassName} to={quotelinkRoute} onClick={(e) => handleClick(e, resolvedQuotelinkCid, resolvedQuotelinkSubplebbitAddress, !!isOP)}>
              {' '}
              #
            </Link>
          );
        })()}
      {showTrailingBreak && <br />}
      {shouldShowQuotelinkPreview &&
        createPortal(
          <div className={styles.replyQuotePreview} data-thread-scroll-preview='true' ref={refs.setFloating} style={floatingStyles}>
            <Post post={quotelinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  return isBacklinkReply ? replyBacklink : isQuotelinkReply && replyQuotelink;
};

const ReplyQuotePreview = ({
  backlinkReply,
  quotelinkReply,
  quotelinkNumber,
  isBacklinkReply,
  isQuotelinkReply,
  isQuotelinkUnavailable,
  isOP,
  showTrailingBreak,
}: ReplyQuotePreviewProps) => {
  const isMobile = useIsMobile();

  return isMobile ? (
    <MobileQuotePreview
      backlinkReply={backlinkReply}
      quotelinkReply={quotelinkReply}
      quotelinkNumber={quotelinkNumber}
      isBacklinkReply={isBacklinkReply}
      isQuotelinkReply={isQuotelinkReply}
      isQuotelinkUnavailable={isQuotelinkUnavailable}
      isOP={isOP}
      showTrailingBreak={showTrailingBreak}
    />
  ) : (
    <DesktopQuotePreview
      backlinkReply={backlinkReply}
      quotelinkReply={quotelinkReply}
      quotelinkNumber={quotelinkNumber}
      isBacklinkReply={isBacklinkReply}
      isQuotelinkReply={isQuotelinkReply}
      isQuotelinkUnavailable={isQuotelinkUnavailable}
      isOP={isOP}
      showTrailingBreak={showTrailingBreak}
    />
  );
};

export default ReplyQuotePreview;
