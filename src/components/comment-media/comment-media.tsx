import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommentMediaInfo, getDisplayMediaInfoType, getHasThumbnail, getMediaDimensions } from '../../lib/utils/media-utils';
import { getHostname } from '../../lib/utils/url-utils';
import useExpandedMediaStore from '../../stores/use-expanded-media-store';
import useFetchGifFirstFrame from '../../hooks/use-fetch-gif-first-frame';
import useIsMobile from '../../hooks/use-is-mobile';
import styles from './comment-media.module.css';
import Embed, { canEmbed } from '../embed';

interface MediaProps {
  commentMediaInfo?: CommentMediaInfo;
  deleted?: boolean;
  disableToggle?: boolean;
  displayHeight?: string;
  displayWidth?: string;
  isFloatingEmbed?: boolean;
  isOutOfFeed?: boolean;
  isReply?: boolean;
  linkHeight?: number;
  linkWidth?: number;
  parentCid?: string;
  removed?: boolean;
  spoiler?: boolean;
  showThumbnail?: boolean;
  setShowThumbnail: (showThumbnail: boolean) => void;
}

const Thumbnail = ({ commentMediaInfo, deleted, displayHeight, displayWidth, isFloatingEmbed, isOutOfFeed, isReply, removed, spoiler, setShowThumbnail }: MediaProps) => {
  const isMobile = useIsMobile();
  const { patternThumbnailUrl, thumbnail, type, url } = commentMediaInfo || {};

  let thumbnailComponent: React.ReactNode = null;
  const iframeThumbnail = patternThumbnailUrl || thumbnail;
  const gifFrameUrl = useFetchGifFirstFrame(type === 'gif' ? url : undefined);
  const hasThumbnail = getHasThumbnail(commentMediaInfo, url);

  if (type === 'gif') {
    thumbnailComponent = <img src={gifFrameUrl || url} alt='' onClick={() => setShowThumbnail(false)} />;
  } else if (type === 'video') {
    thumbnailComponent = thumbnail ? (
      <img src={thumbnail} alt='' />
    ) : (
      // show first frame of the video, as a workaround for Safari not loading thumbnails
      <video src={`${url}#t=0.001`} onClick={() => setShowThumbnail(false)} />
    );
  } else if (type === 'webpage') {
    thumbnailComponent = <img src={thumbnail} alt='' onClick={() => setShowThumbnail(false)} />;
  } else if (type === 'iframe') {
    thumbnailComponent = iframeThumbnail ? <img src={iframeThumbnail} alt='' onClick={() => setShowThumbnail(false)} /> : null;
  } else if (type === 'audio') {
    thumbnailComponent = <audio src={url} controls />;
  }

  const thumbnailSmallPadding = isMobile ? styles.thumbnailMobile : styles.thumbnailReplyDesktop;
  const thumbnailDimensions = { '--width': displayWidth, '--height': displayHeight } as React.CSSProperties;

  const linkWithoutThumbnail = url && new URL(url);

  return deleted || removed ? (
    <img className={styles.fileDeleted} src='assets/filedeleted-res.gif' alt='File deleted' />
  ) : spoiler ? (
    <img className={styles.spoiler} src='assets/spoiler.png' alt='' onClick={() => setShowThumbnail(false)} />
  ) : isOutOfFeed ? (
    <span className={`${isFloatingEmbed ? styles.floatingEmbed : styles.subplebbitAvatar}`}>{thumbnailComponent}</span>
  ) : isMobile || isReply ? (
    <span className={`${styles.thumbnailSmall} ${thumbnailSmallPadding}`} style={thumbnailDimensions}>
      {thumbnailComponent}
      {isMobile &&
        !hasThumbnail &&
        linkWithoutThumbnail &&
        (canEmbed(linkWithoutThumbnail) ? (
          <span onClick={() => setShowThumbnail(false)}>{getHostname(url)}</span>
        ) : (
          <a href={url} target='_blank' rel='noreferrer'>
            {getHostname(url) || (url.length > 30 ? url.slice(0, 30) + '...' : url)}
          </a>
        ))}
    </span>
  ) : (
    <span className={styles.thumbnailBig} style={thumbnailDimensions}>
      {thumbnailComponent}
    </span>
  );
};

const Media = ({ commentMediaInfo, disableToggle, isReply, setShowThumbnail }: MediaProps) => {
  const { t } = useTranslation();
  const { thumbnail, type, url } = commentMediaInfo || {};
  const isMobile = useIsMobile();
  const { fitExpandedImagesToScreen } = useExpandedMediaStore();
  const mediaClass = `${isMobile ? styles.mediaMobile : isReply ? styles.mediaDesktopReply : styles.mediaDesktopOp} ${
    fitExpandedImagesToScreen ? styles.fitToScreen : ''
  }`;
  const mediaDimensions = getMediaDimensions(commentMediaInfo);

  return (
    <span className={mediaClass}>
      {type === 'iframe' && url ? (
        <Embed url={url} />
      ) : type === 'gif' ? (
        <img src={url} alt='' onClick={disableToggle ? undefined : () => setShowThumbnail(true)} />
      ) : type === 'video' ? (
        <video src={url} controls autoPlay loop muted />
      ) : type === 'webpage' ? (
        <img src={thumbnail} alt='' onClick={disableToggle ? undefined : () => setShowThumbnail(true)} />
      ) : null}
      {isMobile && type && (
        <div className={styles.fileInfo}>
          <a href={url} target='_blank' rel='noopener noreferrer'>
            {url && url.length > 30 ? url.slice(0, 30) + '...' : url}
          </a>{' '}
          ({getDisplayMediaInfoType(type, t)}
          {mediaDimensions && `, ${mediaDimensions}`})
        </div>
      )}
      {isMobile && (type === 'iframe' || type === 'video' || type === 'audio') && (
        <div className={styles.closeButton}>
          <span className='button' onClick={() => setShowThumbnail(true)}>
            {t('close')}
          </span>
        </div>
      )}
    </span>
  );
};

interface ImageProps {
  commentMediaInfo: CommentMediaInfo;
  disableToggle?: boolean;
  displayHeight: string;
  displayWidth: string;
  initialExpanded?: boolean;
  isOutOfFeed: boolean;
  parentCid?: string;
  spoiler?: boolean;
}

const Image = ({ commentMediaInfo, disableToggle = false, displayHeight, displayWidth, initialExpanded = false, isOutOfFeed, parentCid, spoiler }: ImageProps) => {
  const { t } = useTranslation();
  const { type, url } = commentMediaInfo || {};
  const isReply = parentCid;
  const isMobile = useIsMobile();
  const [isImageExpanded, setIsImageExpanded] = useState(initialExpanded);
  const { fitExpandedImagesToScreen } = useExpandedMediaStore();
  const mediaDimensions = getMediaDimensions(commentMediaInfo);
  const mediaClass = `${isMobile ? styles.mediaMobile : isReply ? styles.mediaDesktopReply : styles.mediaDesktopOp} ${
    fitExpandedImagesToScreen ? styles.fitToScreen : ''
  }`;
  const thumbnailSmallPadding = isMobile ? styles.thumbnailMobile : styles.thumbnailReplyDesktop;
  const thumbnailDimensions = { '--width': displayWidth, '--height': displayHeight } as React.CSSProperties;

  const [hasError, setHasError] = useState(false);
  const handleError = () => setHasError(true);

  if (spoiler && !isImageExpanded) {
    const spoilerDimensions = { '--width': '150px', '--height': '150px' } as React.CSSProperties;
    return (
      <span
        className={`${isOutOfFeed ? styles.subplebbitAvatar : styles.thumbnailBig} ${styles.thumbnail} ${isImageExpanded && isMobile ? styles.removeFloat : ''}`}
        style={spoilerDimensions}
      >
        <img className={styles.spoiler} src='assets/spoiler.png' alt='' onClick={() => setIsImageExpanded(true)} />
      </span>
    );
  }

  return isMobile ? (
    <span className={`${styles.thumbnail} ${isImageExpanded && isMobile ? styles.removeFloat : ''}`}>
      <span
        className={isImageExpanded ? mediaClass : `${isOutOfFeed ? styles.subplebbitAvatar : styles.thumbnailSmall} ${thumbnailSmallPadding}`}
        style={isImageExpanded ? {} : thumbnailDimensions}
      >
        {hasError ? (
          <img src='assets/filedeleted-res.gif' alt='File deleted' />
        ) : (
          <img src={url} onError={handleError} alt='' onClick={disableToggle ? undefined : () => setIsImageExpanded(!isImageExpanded)} />
        )}
      </span>
      {isImageExpanded && type && (
        <div className={styles.fileInfo}>
          <a href={url} target='_blank' rel='noopener noreferrer'>
            {url && url.length > 30 ? url.slice(0, 30) + '...' : url}
          </a>{' '}
          ({getDisplayMediaInfoType(type, t)}
          {mediaDimensions && `, ${mediaDimensions}`})
        </div>
      )}
      {type && !isImageExpanded && <div className={styles.fileInfo}>{`${spoiler ? `${t('spoiler')} - ` : ''} ${getDisplayMediaInfoType(type, t)}`}</div>}
    </span>
  ) : (
    <span
      className={isImageExpanded ? mediaClass : `${isOutOfFeed ? styles.subplebbitAvatar : styles.thumbnailBig} ${styles.thumbnail}`}
      style={isImageExpanded ? {} : thumbnailDimensions}
    >
      {hasError ? (
        <img src='assets/filedeleted-res.gif' alt='File deleted' />
      ) : (
        <img src={url} onError={handleError} alt='' onClick={disableToggle ? undefined : () => setIsImageExpanded(!isImageExpanded)} />
      )}
    </span>
  );
};

const CommentMedia = ({
  commentMediaInfo,
  deleted,
  disableToggle,
  isFloatingEmbed,
  linkHeight,
  linkWidth,
  parentCid,
  removed,
  showThumbnail,
  setShowThumbnail,
  spoiler,
}: MediaProps) => {
  const isReply = parentCid;
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { thumbnailHeight, thumbnailWidth, url } = commentMediaInfo || {};
  let type = commentMediaInfo?.type;
  const gifFrameUrl = useFetchGifFirstFrame(url);

  if (type === 'gif' && gifFrameUrl) {
    type = 'animated gif';
  } else if (type === 'gif' && !gifFrameUrl) {
    type = 'static gif';
  }

  let displayWidth, displayHeight;
  const maxThumbnailSize = isMobile || isReply ? 125 : 250;

  if (linkWidth && linkHeight) {
    // use the dimensions from the plebbit-js api
    let scale = Math.min(1, maxThumbnailSize / Math.max(linkWidth, linkHeight));
    displayWidth = `${linkWidth * scale}px`;
    displayHeight = `${linkHeight * scale}px`;
  } else if (thumbnailHeight && thumbnailWidth) {
    // use the dimensions from the thumbnail fetched by useCommentMediaInfo
    let scale = Math.min(1, maxThumbnailSize / Math.max(thumbnailWidth, thumbnailHeight));
    displayWidth = `${thumbnailWidth * scale}px`;
    displayHeight = `${thumbnailHeight * scale}px`;
  } else {
    // use the default size
    displayWidth = `${maxThumbnailSize}px`;
    displayHeight = `${maxThumbnailSize}px`;
  }

  if (type === 'audio') {
    displayWidth = '100%';
    displayHeight = '100%';
  }
  const isOutOfFeed = isFloatingEmbed || spoiler || false; // virtuoso wrapper unneeded

  return (
    <span className={styles.content}>
      {commentMediaInfo?.type === 'image' ? (
        // images just enlarge when clicked, so they don't need two separate components
        // when showThumbnail is explicitly false (e.g., from embed button), start expanded
        <Image
          commentMediaInfo={commentMediaInfo}
          disableToggle={disableToggle}
          displayHeight={displayHeight}
          displayWidth={displayWidth}
          initialExpanded={showThumbnail === false}
          isOutOfFeed={isOutOfFeed}
          parentCid={parentCid}
          spoiler={spoiler}
        />
      ) : (
        <>
          <span className={`${showThumbnail ? styles.show : styles.hide} ${styles.thumbnail}`}>
            {url && (
              <Thumbnail
                commentMediaInfo={commentMediaInfo}
                displayHeight={displayHeight}
                displayWidth={displayWidth}
                isFloatingEmbed={isFloatingEmbed}
                isOutOfFeed={isOutOfFeed}
                deleted={deleted}
                removed={removed}
                spoiler={spoiler}
                setShowThumbnail={setShowThumbnail}
              />
            )}
            {isMobile && type && <div className={styles.fileInfo}>{`${spoiler ? `${t('spoiler')} - ` : ''} ${getDisplayMediaInfoType(type, t)}`}</div>}
          </span>
          {!showThumbnail && <Media commentMediaInfo={commentMediaInfo} disableToggle={disableToggle} isReply={!!parentCid} setShowThumbnail={setShowThumbnail} />}
        </>
      )}
    </span>
  );
};

export default CommentMedia;
