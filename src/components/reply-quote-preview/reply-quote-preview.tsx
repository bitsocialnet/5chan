import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Comment, useAccount } from '@plebbit/plebbit-react-hooks';
import { useFloating, offset, shift, size, autoUpdate, Placement } from '@floating-ui/react';
import { useDirectories } from '../../hooks/use-directories';
import { getBoardPath } from '../../lib/utils/route-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import styles from '../../views/post/post.module.css';
import { Post } from '../../views/post';

interface ReplyQuotePreviewProps {
  isBacklinkReply?: boolean;
  backlinkReply?: Comment;
  isQuotelinkReply?: boolean;
  quotelinkReply?: Comment;
  isOP?: boolean;
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

const scrollToThreadCardTop = (threadCid: string) => {
  const threadCard = document.querySelector<HTMLElement>(`[data-cid="${threadCid}"][data-post-cid="${threadCid}"]`);
  if (!threadCard) return false;
  threadCard.scrollIntoView({ behavior: 'auto', block: 'start' });
  return true;
};

const DesktopQuotePreview = ({ backlinkReply, quotelinkReply, isBacklinkReply, isQuotelinkReply, isOP }: ReplyQuotePreviewProps) => {
  const [hoveredCid, setHoveredCid] = useState<string | null>(null);
  const [outOfViewCid, setOutOfViewCid] = useState<string | null>(null);
  const placementRef = useRef<Placement>('right');
  const availableWidthRef = useRef<number>(0);
  const directories = useDirectories();

  const { refs, floatingStyles, update } = useFloating({
    placement: placementRef.current,
    middleware: [
      shift({ padding: 10 }),
      offset({ mainAxis: placementRef.current === 'right' ? 8 : 4 }),
      size({
        apply({ availableWidth, elements }) {
          availableWidthRef.current = availableWidth;
          if (availableWidth >= 250) {
            elements.floating.style.maxWidth = `${availableWidth - 12}px`;
          } else if (placementRef.current === 'right') {
            placementRef.current = 'left';
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
        placementRef.current = 'right';
      } else {
        placementRef.current = 'left';
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

  const handleClick = (e: React.MouseEvent, cid: string | undefined, subplebbitAddress: string | undefined, isOpQuote = false) => {
    e.preventDefault();
    if (cid && subplebbitAddress) {
      const boardPath = getBoardPath(subplebbitAddress, directories);
      const threadRoute = `/${boardPath}/thread/${cid}`;
      if (isOpQuote && location.pathname === threadRoute) {
        scrollToThreadCardTop(cid);
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
          <div className={styles.replyQuotePreview} ref={refs.setFloating} style={floatingStyles}>
            <Post post={backlinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  const account = useAccount();

  const quotelinkBoardPath = quotelinkReply?.subplebbitAddress ? getBoardPath(quotelinkReply.subplebbitAddress, directories) : undefined;
  const quotelinkRoute = quotelinkReply?.cid ? (quotelinkBoardPath ? `/${quotelinkBoardPath}/thread/${quotelinkReply.cid}` : `/thread/${quotelinkReply.cid}`) : '#';

  const replyQuotelink = (
    <>
      <Link
        to={quotelinkRoute}
        ref={refs.setReference}
        className={styles.quoteLink}
        onMouseOver={() => handleMouseOver(quotelinkReply?.cid)}
        onMouseLeave={() => handleMouseLeave(quotelinkReply?.cid)}
        onClick={(e) => handleClick(e, quotelinkReply?.cid, quotelinkReply?.subplebbitAddress, !!isOP)}
      >
        {`>>${quotelinkReply?.number ?? '?'}`}
        {isOP && ' (OP)'}
        {quotelinkReply?.author?.address === account?.author?.address && ' (You)'}
      </Link>
      <br />
      {hoveredCid === quotelinkReply?.cid &&
        outOfViewCid === quotelinkReply?.cid &&
        createPortal(
          <div className={styles.replyQuotePreview} ref={refs.setFloating} style={floatingStyles}>
            <Post post={quotelinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  return isBacklinkReply ? replyBacklink : isQuotelinkReply && replyQuotelink;
};

const MobileQuotePreview = ({ backlinkReply, quotelinkReply, isBacklinkReply, isQuotelinkReply, isOP }: ReplyQuotePreviewProps) => {
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

  const handleClick = (e: React.MouseEvent, cid: string | undefined, subplebbitAddress: string | undefined, isOpQuote = false) => {
    e.preventDefault();
    if (cid && subplebbitAddress) {
      const boardPath = getBoardPath(subplebbitAddress, directories);
      const threadRoute = `/${boardPath}/thread/${cid}`;
      if (isOpQuote && location.pathname === threadRoute) {
        scrollToThreadCardTop(cid);
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
          <div className={styles.replyQuotePreview} ref={refs.setFloating} style={floatingStyles}>
            <Post post={backlinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  const account = useAccount();

  const replyQuotelink = (
    <>
      <span
        ref={refs.setReference}
        className={styles.quoteLink}
        onMouseOver={() => handleMouseOver(quotelinkReply?.cid)}
        onMouseLeave={() => handleMouseLeave(quotelinkReply?.cid)}
      >
        {`>>${quotelinkReply?.number ?? '?'}`}
        {isOP && ' (OP)'}
        {quotelinkReply?.author?.address === account?.author?.address && ' (You)'}
      </span>
      {quotelinkReply?.number &&
        (() => {
          const quotelinkBoardPath = quotelinkReply?.subplebbitAddress ? getBoardPath(quotelinkReply.subplebbitAddress, directories) : undefined;
          const quotelinkRoute = quotelinkReply?.cid
            ? quotelinkBoardPath
              ? `/${quotelinkBoardPath}/thread/${quotelinkReply.cid}`
              : `/thread/${quotelinkReply.cid}`
            : '#';
          return (
            <Link className={styles.quoteLink} to={quotelinkRoute} onClick={(e) => handleClick(e, quotelinkReply?.cid, quotelinkReply?.subplebbitAddress, !!isOP)}>
              {' '}
              #
            </Link>
          );
        })()}
      {hoveredCid === quotelinkReply?.cid &&
        outOfViewCid === quotelinkReply?.cid &&
        createPortal(
          <div className={styles.replyQuotePreview} ref={refs.setFloating} style={floatingStyles}>
            <Post post={quotelinkReply} showReplies={false} />
          </div>,
          document.body,
        )}
    </>
  );

  return isBacklinkReply ? replyBacklink : isQuotelinkReply && replyQuotelink;
};

const ReplyQuotePreview = ({ backlinkReply, quotelinkReply, isBacklinkReply, isQuotelinkReply, isOP }: ReplyQuotePreviewProps) => {
  const isMobile = useIsMobile();

  return isMobile ? (
    <MobileQuotePreview backlinkReply={backlinkReply} quotelinkReply={quotelinkReply} isBacklinkReply={isBacklinkReply} isQuotelinkReply={isQuotelinkReply} isOP={isOP} />
  ) : (
    <DesktopQuotePreview
      backlinkReply={backlinkReply}
      quotelinkReply={quotelinkReply}
      isBacklinkReply={isBacklinkReply}
      isQuotelinkReply={isQuotelinkReply}
      isOP={isOP}
    />
  );
};

export default ReplyQuotePreview;
