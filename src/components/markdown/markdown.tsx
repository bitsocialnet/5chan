import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import supersub from 'remark-supersub';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { useDismiss, useFloating, useFocus, useHover, useInteractions, offset, shift, size, autoUpdate, Placement, FloatingPortal } from '@floating-ui/react';
import { getLinkMediaInfo, getHasThumbnail } from '../../lib/utils/media-utils';
import { isCatalogView } from '../../lib/utils/view-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import CommentMedia from '../comment-media';
import styles from './markdown.module.css';
import { Link, useLocation, useParams } from 'react-router-dom';
import { canEmbed } from '../embed';
import { is5chanLink, transform5chanLinkToInternal, preprocess5chanPatterns } from '../../lib/utils/url-utils';
import usePostNumberStore from '../../stores/use-post-number-store';
import useSubplebbitsPagesStore from '@plebbit/plebbit-react-hooks/dist/stores/subplebbits-pages';
import { useComment } from '@plebbit/plebbit-react-hooks';
import ReplyQuotePreview from '../reply-quote-preview';

interface ContentLinkEmbedProps {
  children: any;
  href: string;
  linkMediaInfo: any;
}

interface ExtendedComponents extends Components {
  spoiler: React.ComponentType<{ children: React.ReactNode }>;
}

const ContentLinkEmbed = ({ children, href, linkMediaInfo }: ContentLinkEmbedProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const placementRef = useRef<Placement>('right');
  const availableWidthRef = useRef<number>(0);

  const { refs, floatingStyles, update, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: placementRef.current,
    middleware: [
      shift({ padding: 10 }),
      offset({ mainAxis: 5 }),
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

  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss]);

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

  return (
    <>
      <a href={href} target='_blank' rel='noopener noreferrer'>
        {children}
      </a>{' '}
      [
      <span className={styles.embedButton} onClick={() => setShowMedia(!showMedia)} ref={refs.setReference} {...getReferenceProps()}>
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

const MAX_LENGTH_FOR_GFM = 10000; // remarkGfm lags with large content

const blockquoteToGreentext = () => (tree: any) => {
  tree.children.forEach((node: any) => {
    if (node.type === 'blockquote') {
      node.children.forEach((child: any) => {
        if (child.type === 'paragraph' && child.children.length > 0) {
          const prefix = {
            type: 'text',
            value: '>',
          };
          child.children.unshift(prefix);
        }
      });
      node.type = 'div';
      node.data = {
        hName: 'div',
        hProperties: {
          className: 'greentext',
        },
      };
    }
  });
};

const spoilerTransform = () => (tree: any) => {
  const visit = (node: any) => {
    if (node.tagName === 'spoiler') {
      node.tagName = 'span';
      node.properties = node.properties || {};
      node.properties.className = 'spoilertext';
    }

    if (node.children) {
      node.children.forEach(visit);
    }
  };

  if (tree.children) {
    tree.children.forEach(visit);
  }
};

interface MarkdownProps {
  content: string;
  title?: string;
  postCid?: string;
}

const NUMBER_QUOTE_HREF_REGEX = /^#q-(\d+)$/;

const NumberQuoteLink = ({ number, threadPostCid }: { number: number; threadPostCid?: string }) => {
  const cid = usePostNumberStore((state) => state.numberToCid[number]);
  const commentFromStore = useSubplebbitsPagesStore((state) => (cid ? state.comments[cid] : undefined));
  const commentFromHook = useComment({ commentCid: cid, onlyIfCached: true });
  const comment = commentFromHook?.number !== undefined ? commentFromHook : commentFromStore;
  const isOP = Boolean(threadPostCid && cid === threadPostCid);

  if (!comment) {
    return <span>{`>>${number}`}</span>;
  }

  return <ReplyQuotePreview isQuotelinkReply={true} quotelinkReply={comment} isOP={isOP} showTrailingBreak={false} />;
};

const renderAnchorLink = (children: React.ReactNode, href: string, threadPostCid?: string) => {
  if (!href) {
    return <span>{children}</span>;
  }

  const numberQuoteMatch = href.match(NUMBER_QUOTE_HREF_REGEX);
  if (numberQuoteMatch) {
    const number = parseInt(numberQuoteMatch[1], 10);
    return (
      <span className={styles.inlineQuoteLink}>
        <NumberQuoteLink number={number} threadPostCid={threadPostCid} />
      </span>
    );
  }

  // Check if this is a valid 5chan link that should be handled internally
  if (is5chanLink(href)) {
    const internalPath = transform5chanLinkToInternal(href);
    if (internalPath) {
      // Check if the link text should be replaced with the internal path
      let shouldReplaceText = false;

      if (typeof children === 'string') {
        shouldReplaceText = children === href || children.trim() === href.trim();
      } else if (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string') {
        shouldReplaceText = children[0] === href || children[0].trim() === href.trim();
      }

      // For display purposes, remove leading slash from paths like "/biz" or board identifiers
      let displayText: React.ReactNode = children;
      if (shouldReplaceText && internalPath.match(/^\/[^/]+$/)) {
        displayText = internalPath.substring(1); // Remove leading slash
      } else if (shouldReplaceText) {
        displayText = internalPath;
      }

      return <Link to={internalPath}>{displayText}</Link>;
    } else {
      console.warn('Failed to transform 5chan link to internal path:', href);
      return <Link to={href}>{children}</Link>;
    }
  }

  // Handle hash routes and internal patterns (including routes that start with /#/)
  // Support both old format (/p/...) for backward compatibility and new format (/{boardIdentifier}/...)
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

  // External links
  return (
    <a href={href} target='_blank' rel='noopener noreferrer'>
      {children}
    </a>
  );
};

const Markdown = ({ content, title, postCid }: MarkdownProps) => {
  const remarkPlugins: any[] = [[supersub]];

  if (content && content.length <= MAX_LENGTH_FOR_GFM) {
    remarkPlugins.push([remarkGfm, { singleTilde: false }]);
  }

  remarkPlugins.push([blockquoteToGreentext]);
  remarkPlugins.push([spoilerTransform]);

  const customSchema = useMemo(
    () => ({
      ...defaultSchema,
      tagNames: [...(defaultSchema.tagNames || []), 'div', 'span', 'spoiler'],
      attributes: {
        ...defaultSchema.attributes,
        div: ['className'],
        span: ['className'],
        spoiler: [],
      },
    }),
    [],
  );

  const isInCatalogView = isCatalogView(useLocation().pathname, useParams());

  // Preprocess content to convert plain text 5chan patterns to markdown links
  const processedContent = preprocess5chanPatterns(content || '');

  return (
    <span className={styles.markdown}>
      {isInCatalogView && title && (
        <span>
          <b>{title}</b>
          {content ? ': ' : ''}
        </span>
      )}
      <ReactMarkdown
        children={processedContent}
        remarkPlugins={remarkPlugins}
        rehypePlugins={[[rehypeRaw as any], [rehypeSanitize, customSchema]]}
        components={
          {
            p: ({ children }) => <p className={isInCatalogView ? styles.inline : ''}>{children}</p>,
            h1: ({ children }) => <p className={styles.header}>{children}</p>,
            h2: ({ children }) => <p className={styles.header}>{children}</p>,
            h3: ({ children }) => <p className={styles.header}>{children}</p>,
            h4: ({ children }) => <p className={styles.header}>{children}</p>,
            h5: ({ children }) => <p className={styles.header}>{children}</p>,
            h6: ({ children }) => <p className={styles.header}>{children}</p>,
            img: ({ src, alt }) => {
              const displayText = src || alt || 'image';
              return <span>{displayText}</span>;
            },
            video: ({ src }) => <span>{src}</span>,
            iframe: ({ src }) => <span>{src}</span>,
            source: ({ src }) => <span>{src}</span>,
            spoiler: ({ children }) => <span className='spoilertext'>{children}</span>,
            a: ({ href, children }) => {
              if (href && !isInCatalogView) {
                try {
                  const linkMediaInfo = getLinkMediaInfo(href);
                  const embedUrl = href.startsWith('http') ? new URL(href) : null;
                  if ((embedUrl && canEmbed(embedUrl)) || getHasThumbnail(linkMediaInfo, href)) {
                    return <ContentLinkEmbed children={children} href={href} linkMediaInfo={linkMediaInfo} />;
                  }
                } catch (e) {
                  console.debug('Invalid URL:', href);
                }

                return renderAnchorLink(children, href, postCid);
              }

              return renderAnchorLink(children, href || '', postCid);
            },
          } as ExtendedComponents
        }
      />
    </span>
  );
};
export default React.memo(Markdown);
