import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Placement } from '@floating-ui/react';
import { useTranslation } from 'react-i18next';
import { useDismiss, useFloating, useFocus, useHover, useInteractions, offset, shift, size, autoUpdate, FloatingPortal } from '@floating-ui/react';
import { getLinkMediaInfo, getHasThumbnail } from '../../lib/utils/media-utils';
import { isCatalogView } from '../../lib/utils/view-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import CommentMedia from '../comment-media';
import styles from './markdown.module.css';
import { Link, useLocation, useParams } from 'react-router-dom';
import { canEmbed } from '../embed';
import { is5chanLink, transform5chanLinkToInternal, isValidCrossboardPattern } from '../../lib/utils/url-utils';
import { CROSSBOARD_NUMBER_QUOTE_TOKEN_REGEX, type ExternalQuoteReference } from '../../lib/utils/external-quote-utils';
import { isUnavailableQuoteTarget } from '../../lib/utils/quote-link-utils';
import usePostNumberStore from '../../stores/use-post-number-store';
import useCommunitiesPagesStore from '@bitsocialnet/bitsocial-react-hooks/dist/stores/communities-pages';
import { useComment } from '@bitsocialnet/bitsocial-react-hooks';
import ReplyQuotePreview from '../reply-quote-preview';
import ExternalNumberQuoteLink from './external-number-quote-link';

const safeParseUrl = (href: string): URL | null => {
  try {
    return href.startsWith('http') ? new URL(href) : null;
  } catch {
    return null;
  }
};

interface ContentLinkEmbedProps {
  children: any;
  href: string;
  linkMediaInfo: any;
}

const ContentLinkEmbed = ({ children, href, linkMediaInfo }: ContentLinkEmbedProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [placement, setPlacement] = useState<Placement>('right');
  const availableWidthRef = useRef<number>(0);

  const { refs, floatingStyles, update, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    middleware: [
      shift({ padding: 10 }),
      offset({ mainAxis: 5 }),
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

  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss]);

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

  return (
    <>
      <a href={href} target='_blank' rel='noopener noreferrer'>
        {children}
      </a>{' '}
      [
      <span
        className={styles.embedButton}
        role='button'
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowMedia(!showMedia);
          }
        }}
        onClick={() => setShowMedia(!showMedia)}
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        {showMedia ? t('remove') : isMobile ? t('open') : t('embed')}
      </span>
      ]
      {showMedia && (
        <>
          <br />
          <CommentMedia commentMediaInfo={linkMediaInfo} disableToggle={true} isReply={false} setShowThumbnail={setShowMedia} showThumbnail={false} />
        </>
      )}
      {getHasThumbnail(linkMediaInfo, href) && (
        <FloatingPortal>
          {isOpen && !isMobile && (
            <div className={styles.floatingEmbed} ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
              <CommentMedia
                commentMediaInfo={linkMediaInfo}
                disableToggle={true}
                isFloatingEmbed={true}
                isReply={false}
                setShowThumbnail={setShowMedia}
                showThumbnail={false}
              />
            </div>
          )}
        </FloatingPortal>
      )}
    </>
  );
};

const normalizeContent = (content: string): string => {
  if (!content) return '';
  let normalized = content.replace(/\n&nbsp;\n/g, '\n\n');
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  return normalized;
};

type Token =
  | { type: 'text'; value: string }
  | { type: 'url'; href: string }
  | { type: 'quoteLink'; number: number }
  | { type: 'crossBoardNumberQuoteLink'; reference: ExternalQuoteReference }
  | { type: 'crossBoardLink'; display: string; route: string }
  | { type: 'spoiler'; tokens: Token[] };

const SPOILER_REGEX = /\[[sS][pP][oO][iI][lL][eE][rR]\]([\s\S]*?)\[\/[sS][pP][oO][iI][lL][eE][rR]\]/;
const CROSSBOARD_REGEX = />>>\/((?:[a-zA-Z0-9]{1,10}\/(?:[a-zA-Z0-9]{46})?|[a-zA-Z0-9\-.]+(?:\/[a-zA-Z0-9]{46})?))[.,:;!?]*/;
const QUOTE_LINK_REGEX = /(?<![>/\w])>>(\d+)(?![\d/])/;
const URL_REGEX = /https?:\/\/[^\s<\[\]]*[^\s<\[\].,;:!?\"'\)\]>]/;

const COMBINED_REGEX = new RegExp(
  `(${SPOILER_REGEX.source})|(${CROSSBOARD_NUMBER_QUOTE_TOKEN_REGEX.source})|(${CROSSBOARD_REGEX.source})|(${QUOTE_LINK_REGEX.source})|(${URL_REGEX.source})`,
  'g',
);

function getCrossboardRoute(fullPattern: string): string | null {
  const pathPart = fullPattern.replace(/^>>>\//, '').replace(/[.,:;!?]+$/, '');
  if (!isValidCrossboardPattern(`>>>/${pathPart}`)) {
    return null;
  }
  if (/^[a-zA-Z0-9]{1,10}\/$/.test(pathPart)) {
    return `/${pathPart.slice(0, -1)}`;
  }
  if (/^[a-zA-Z0-9]{1,10}\/[a-zA-Z0-9]{46}$/.test(pathPart)) {
    const [code, cid] = pathPart.split('/');
    return `/${code}/thread/${cid}`;
  }
  if (/^[^/]+\/[a-zA-Z0-9]{46}$/.test(pathPart)) {
    const [address, cid] = pathPart.split('/');
    return `/${address}/thread/${cid}`;
  }
  return `/${pathPart}`;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;

  const regex = new RegExp(COMBINED_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchStart = match.index;

    if (matchStart > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, matchStart) });
    }

    if (match[1] !== undefined) {
      const innerContent = match[2];
      tokens.push({ type: 'spoiler', tokens: tokenize(innerContent) });
    } else if (match[3] !== undefined) {
      const boardIdentifier = match[4];
      const number = parseInt(match[5], 10);
      if (boardIdentifier && !Number.isNaN(number)) {
        tokens.push({
          type: 'crossBoardNumberQuoteLink',
          reference: {
            boardIdentifier,
            kind: 'cross-board',
            number,
            raw: `>>>/${boardIdentifier}/${number}`,
          },
        });
      } else {
        tokens.push({ type: 'text', value: fullMatch });
      }
    } else if (match[6] !== undefined) {
      const pathPart = match[7];
      const fullPattern = `>>>/${pathPart}`;
      const route = getCrossboardRoute(fullPattern);
      if (route) {
        tokens.push({ type: 'crossBoardLink', display: fullPattern, route });
      } else {
        tokens.push({ type: 'text', value: fullMatch });
      }
    } else if (match[8] !== undefined) {
      const number = parseInt(match[9], 10);
      tokens.push({ type: 'quoteLink', number });
    } else if (match[10] !== undefined) {
      tokens.push({ type: 'url', href: fullMatch });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

interface RenderContext {
  isInCatalogView: boolean;
  postCid?: string;
  communityAddress?: string;
}

function renderTokens(tokens: Token[], context: RenderContext): React.ReactNode[] {
  const { isInCatalogView, postCid, communityAddress } = context;

  return tokens.map((token, i) => {
    switch (token.type) {
      case 'text':
        return <React.Fragment key={i}>{token.value}</React.Fragment>;
      case 'url': {
        const href = token.href;
        const linkMediaInfo = getLinkMediaInfo(href);
        const embedUrl = safeParseUrl(href);
        if (!isInCatalogView && ((embedUrl && canEmbed(embedUrl)) || getHasThumbnail(linkMediaInfo, href))) {
          return (
            <ContentLinkEmbed key={i} href={href} linkMediaInfo={linkMediaInfo}>
              {href}
            </ContentLinkEmbed>
          );
        }
        return <React.Fragment key={i}>{renderAnchorLink(href, href, postCid, communityAddress)}</React.Fragment>;
      }
      case 'quoteLink':
        return (
          <span key={i} className={styles.inlineQuoteLink}>
            <NumberQuoteLink number={token.number} threadPostCid={postCid} communityAddress={communityAddress} />
          </span>
        );
      case 'crossBoardNumberQuoteLink':
        return (
          <span key={i} className={styles.inlineQuoteLink}>
            <ExternalNumberQuoteLink reference={token.reference} />
          </span>
        );
      case 'crossBoardLink':
        return (
          <Link key={i} to={token.route}>
            {token.display}
          </Link>
        );
      case 'spoiler':
        return (
          <span key={i} className='spoilertext'>
            {renderTokens(token.tokens, context)}
          </span>
        );
    }
  });
}

interface MarkdownProps {
  content: string;
  title?: string;
  postCid?: string;
  communityAddress?: string;
}

const NumberQuoteLink = ({ number, threadPostCid, communityAddress }: { number: number; threadPostCid?: string; communityAddress?: string }) => {
  const cid = usePostNumberStore((state) => (communityAddress ? state.numberToCid[communityAddress]?.[number] : undefined));
  const commentFromStore = useCommunitiesPagesStore((state) => (cid ? state.comments[cid] : undefined));
  const commentFromHook = useComment({ commentCid: cid, onlyIfCached: true });
  const comment = commentFromHook?.number !== undefined ? commentFromHook : commentFromStore;
  const isOP = Boolean(threadPostCid && cid === threadPostCid);

  if (isUnavailableQuoteTarget(comment)) {
    return (
      <ReplyQuotePreview isQuotelinkReply={true} quotelinkReply={comment} quotelinkNumber={number} isQuotelinkUnavailable={true} isOP={isOP} showTrailingBreak={false} />
    );
  }

  if (!cid && communityAddress) {
    return (
      <ExternalNumberQuoteLink
        reference={{
          kind: 'same-board',
          number,
          raw: `>>${number}`,
          subplebbitAddress: communityAddress,
        }}
      />
    );
  }

  return <ReplyQuotePreview isQuotelinkReply={true} quotelinkReply={comment} quotelinkNumber={number} isOP={isOP} showTrailingBreak={false} />;
};

const renderAnchorLink = (children: React.ReactNode, href: string, threadPostCid?: string, communityAddress?: string) => {
  if (!href) {
    return <span>{children}</span>;
  }

  if (is5chanLink(href)) {
    const internalPath = transform5chanLinkToInternal(href);
    if (internalPath) {
      let shouldReplaceText = false;

      if (typeof children === 'string') {
        shouldReplaceText = children === href || children.trim() === href.trim();
      } else if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') {
        shouldReplaceText = children[0] === href || children[0].trim() === href.trim();
      }

      let displayText: React.ReactNode = children;
      const childrenText = typeof children === 'string' ? children : Array.isArray(children) ? children[0] : '';
      const isAutolinkedUrl = shouldReplaceText && typeof childrenText === 'string' && childrenText.startsWith('http');

      if (isAutolinkedUrl) {
        displayText = children;
      } else if (shouldReplaceText && internalPath.match(/^\/[^/]+$/)) {
        displayText = internalPath.substring(1);
      } else if (shouldReplaceText) {
        displayText = internalPath;
      }

      return <Link to={internalPath}>{displayText}</Link>;
    } else {
      console.warn('Failed to transform 5chan link to internal path:', href);
      return <Link to={href}>{children}</Link>;
    }
  }

  if (
    href.startsWith('#/') ||
    href.startsWith('/#/') ||
    href.startsWith('/p/') ||
    href.match(/^\/p\/[^/]+(\/c\/[^/]+)?$/) ||
    href.match(/^\/[^/]+(\/thread\/[^/]+)?$/) ||
    href.match(/^\/[^/]+\/(catalog|description|rules)(\/settings)?$/)
  ) {
    return <Link to={href}>{children}</Link>;
  }

  return (
    <a href={href} target='_blank' rel='noopener noreferrer'>
      {children}
    </a>
  );
};

const Markdown = ({ content, title, postCid, communityAddress }: MarkdownProps) => {
  const location = useLocation();
  const params = useParams();
  const isInCatalogView = isCatalogView(location.pathname, params);

  const rendered = useMemo(() => {
    const normalized = normalizeContent(content || '');
    const lines = normalized.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        elements.push(<br key={`br-${lineIndex}`} />);
      }

      if (line.length === 0) return;

      const isGreentext = /^>[^>]/.test(line) || line === '>';

      const tokens = tokenize(line);
      const lineElements = renderTokens(tokens, { isInCatalogView, postCid, communityAddress });

      if (isGreentext) {
        elements.push(
          <span key={`line-${lineIndex}`} className='greentext'>
            {lineElements}
          </span>,
        );
      } else {
        elements.push(<React.Fragment key={`line-${lineIndex}`}>{lineElements}</React.Fragment>);
      }
    });

    return elements;
  }, [content, isInCatalogView, postCid, communityAddress]);

  return (
    <span className={styles.markdown}>
      {isInCatalogView && title && (
        <span>
          <b>{title}</b>
          {content ? ': ' : ''}
        </span>
      )}
      {rendered}
    </span>
  );
};
export default React.memo(Markdown);
