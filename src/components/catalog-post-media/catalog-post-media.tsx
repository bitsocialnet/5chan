import { type SyntheticEvent, useState } from 'react';
import type { CommentMediaInfo } from '../../lib/utils/media-utils';
import useCatalogStyleStore from '../../stores/use-catalog-style-store';
import useImageFiltersStore from '../../stores/use-image-filters-store';
import useFetchGifFirstFrame from '../../hooks/use-fetch-gif-first-frame';
import { useYouTubeThumbnailFallback } from '../../hooks/use-youtube-thumbnail-fallback';
import GifFirstFrameCanvas from '../gif-first-frame-canvas';
import styles from './catalog-post-media.module.css';

interface CatalogPostMediaProps {
  cid: string;
  commentMediaInfo: CommentMediaInfo | undefined;
  isOutOfFeed?: boolean;
  linkWidth?: number;
  linkHeight?: number;
  matchedFilterColor?: string;
  pinned?: boolean;
}

export const CatalogPostMedia = ({ cid, commentMediaInfo, isOutOfFeed = false, linkWidth, linkHeight, matchedFilterColor, pinned = false }: CatalogPostMediaProps) => {
  void cid;
  const { patternThumbnailUrl, thumbnail, type, url } = commentMediaInfo || {};
  const iframeThumbnail = patternThumbnailUrl || thumbnail;
  const {
    handleThumbnailError: handleIframeThumbnailError,
    handleThumbnailLoad: handleIframeThumbnailLoad,
    isUnavailable: isIframeThumbnailUnavailable,
    thumbnailUrl: resolvedIframeThumbnail,
  } = useYouTubeThumbnailFallback(iframeThumbnail);
  const { frameUrl: gifFrameUrl, status: gifFrameStatus } = useFetchGifFirstFrame(type === 'gif' ? url : undefined);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const handleLoad = () => setIsLoaded(true);
  const handleError = () => setHasError(true);
  const hashLoadedImage = useImageFiltersStore((state) => state.hashLoadedImage);
  const handleImageLoad = () => {
    handleLoad();
    hashLoadedImage(url);
  };
  const handleIframeLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (handleIframeThumbnailLoad(event.currentTarget)) {
      return;
    }

    handleLoad();
  };
  const handleIframeError = () => {
    if (handleIframeThumbnailError()) {
      return;
    }

    handleError();
  };
  const loadingStyle = { opacity: isLoaded ? 1 : 0 };

  const catalogImageSize = useCatalogStyleStore((state) => state.imageSize);
  // The catalog image size setting only applies to catalog rows; out-of-feed cards (home popular threads) are laid out for 150px thumbnails.
  const imageSize = isOutOfFeed ? 'Small' : catalogImageSize;

  let displayWidth, displayHeight;
  const maxThumbnailSize = imageSize === 'Large' ? 250 : 150;

  if (linkWidth && linkHeight) {
    let scale = Math.min(1, maxThumbnailSize / Math.max(linkWidth, linkHeight));
    displayWidth = `${linkWidth * scale}px`;
    displayHeight = `${linkHeight * scale}px`;
  } else {
    displayWidth = `${maxThumbnailSize}px`;
    displayHeight = `${maxThumbnailSize}px`;
  }

  if (type === 'audio') {
    displayWidth = `${maxThumbnailSize}px`;
    displayHeight = '54px';
  }

  const hasKnownMediaDimensions = Boolean(linkWidth && linkHeight);
  const numericWidth = hasKnownMediaDimensions ? parseInt(displayWidth) || undefined : undefined;
  const numericHeight = hasKnownMediaDimensions ? parseInt(displayHeight) || undefined : undefined;

  const maxWidth = imageSize === 'Large' ? '250px' : '150px';
  const maxHeight = imageSize === 'Large' ? '250px' : '150px';

  const CSSProperties = {
    '--width': displayWidth,
    '--height': displayHeight,
    '--maxWidth': maxWidth,
    '--maxHeight': maxHeight,
  } as React.CSSProperties;

  let thumbnailComponent: React.ReactNode = null;

  if (type === 'gif' && gifFrameStatus === 'ready' && gifFrameUrl && !hasError) {
    thumbnailComponent = <img src={gifFrameUrl} alt='' onLoad={handleLoad} onError={handleError} style={loadingStyle} width={numericWidth} height={numericHeight} />;
  } else if (type === 'gif' && gifFrameStatus === 'failed' && !hasError) {
    thumbnailComponent = url && <GifFirstFrameCanvas src={url} onLoad={handleLoad} onError={handleError} style={loadingStyle} />;
  } else if (type === 'image' && !hasError) {
    thumbnailComponent = <img src={url} alt='' onLoad={handleImageLoad} onError={handleError} style={loadingStyle} width={numericWidth} height={numericHeight} />;
  } else if (type === 'video' && !hasError) {
    thumbnailComponent = thumbnail ? (
      <img src={thumbnail} alt='' onLoad={handleLoad} onError={handleError} style={loadingStyle} width={numericWidth} height={numericHeight} />
    ) : (
      // show first frame of the video, as a workaround for Safari not loading thumbnails
      <video src={`${url}#t=0.001`} aria-label='Video thumbnail' onError={handleError} />
    );
  } else if (type === 'webpage' && !hasError) {
    thumbnailComponent = <img src={thumbnail} alt='' onLoad={handleLoad} onError={handleError} style={loadingStyle} width={numericWidth} height={numericHeight} />;
  } else if (type === 'iframe' && resolvedIframeThumbnail && !hasError) {
    thumbnailComponent = (
      <img src={resolvedIframeThumbnail} alt='' onLoad={handleIframeLoad} onError={handleIframeError} style={loadingStyle} width={numericWidth} height={numericHeight} />
    );
  } else if (type === 'audio') {
    thumbnailComponent = <audio src={url} aria-label='Audio preview' controls />;
  }

  return (
    <div
      className={`${hasError || isIframeThumbnailUnavailable ? '' : styles.mediaWrapper} ${pinned && !matchedFilterColor ? styles.pinned : ''}`}
      style={{
        ...CSSProperties,
        ...(matchedFilterColor ? { border: `3px solid ${matchedFilterColor}` } : {}),
      }}
    >
      {!isLoaded && !hasError && !isIframeThumbnailUnavailable && type !== 'video' && type !== 'audio' && <span className={styles.loadingSkeleton} />}
      {hasError || isIframeThumbnailUnavailable ? <img className={styles.fileDeleted} src='assets/filedeleted-res.gif' alt='' /> : thumbnailComponent}
    </div>
  );
};
