import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import capitalize from 'lodash/capitalize';
import type { AttachedMedia } from '../../lib/media-hosting/types';
import { type CommentMediaInfo, formatFileSize } from '../../lib/utils/media-utils';
import { truncateWithEllipsisInMiddle } from '../../lib/utils/string-utils';
import usePendingUploadPostStore, { type PendingUploadPhase } from '../../stores/use-pending-upload-post-store';
import CommentMedia from '../comment-media';
import LoadingEllipsis from '../loading-ellipsis';
import styles from '../post-styles';

type PreviewMediaType = 'image' | 'video';

const getPreviewMediaType = (mimeType: string): PreviewMediaType | undefined => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return undefined;
};

/** The chosen file as a URL the thumbnail can load before the file is uploaded anywhere. */
const useLocalPreviewUrl = (attachment: AttachedMedia | undefined) => {
  const file = attachment?.kind === 'file' ? attachment.file : undefined;
  const [objectUrl, setObjectUrl] = useState<{ file: File; url: string }>();

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // oxlint-disable-next-line react/set-state-in-effect -- the object URL exists only between this effect and its cleanup, which revokes it
    setObjectUrl({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // A file picked on Android stays native-side; its web path already serves it to the WebView.
  if (attachment?.kind === 'picked') return attachment.webPath;
  return objectUrl && objectUrl.file === file ? objectUrl.url : undefined;
};

/** The file's pixel size, which sizes the thumbnail the way a published post's link dimensions do. */
const useLocalMediaDimensions = (url: string | undefined, mediaType: PreviewMediaType | undefined) => {
  const [dimensions, setDimensions] = useState<{ url: string; width: number; height: number }>();

  useEffect(() => {
    if (!url || !mediaType) return;
    let cancelled = false;
    const settle = (width: number, height: number) => {
      if (!cancelled && width > 0 && height > 0) setDimensions({ url, width, height });
    };
    if (mediaType === 'image') {
      const image = new Image();
      image.onload = () => settle(image.naturalWidth, image.naturalHeight);
      image.src = url;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => settle(video.videoWidth, video.videoHeight);
      video.src = url;
    }
    return () => {
      cancelled = true;
    };
  }, [mediaType, url]);

  return dimensions && dimensions.url === url ? dimensions : undefined;
};

/** Size and pixel size, as a published post's file row shows them. */
const getFileDetails = (attachment: AttachedMedia, dimensions: { width: number; height: number } | undefined) => {
  const details = [attachment.kind === 'file' ? formatFileSize(attachment.file.size) : undefined, dimensions ? `${dimensions.width}x${dimensions.height}` : undefined];
  const text = details.filter(Boolean).join(', ');
  return text ? ` (${text})` : '';
};

const UPLOAD_PHASE_LABEL_KEYS: Partial<Record<PendingUploadPhase, string>> = { uploading: 'uploading', checking: 'running_automated_checks' };

/**
 * The file row of a new thread whose file is not uploaded yet: the local file as its thumbnail, and the
 * upload's progress after its size.
 */
const PendingUploadFile = ({ pendingUploadId, spoiler }: { pendingUploadId: number; spoiler?: boolean }) => {
  const { t } = useTranslation();
  const pendingUploadPost = usePendingUploadPostStore((state) => state.pendingUploadPosts.find((post) => post.id === pendingUploadId));
  const attachment = pendingUploadPost?.attachment;
  const mediaType = attachment ? getPreviewMediaType(attachment.mimeType) : undefined;
  const previewUrl = useLocalPreviewUrl(attachment);
  const dimensions = useLocalMediaDimensions(previewUrl, mediaType);
  const [showThumbnail, setShowThumbnail] = useState(true);

  if (!attachment) return null;

  const phaseLabelKey = pendingUploadPost.phase ? UPLOAD_PHASE_LABEL_KEYS[pendingUploadPost.phase] : undefined;
  const commentMediaInfo: CommentMediaInfo | undefined = previewUrl && mediaType ? { url: previewUrl, type: mediaType } : undefined;

  return (
    <div className={styles.file}>
      <div className={styles.fileText}>
        {t('file')}: {spoiler ? capitalize(t('spoiler')) : truncateWithEllipsisInMiddle(attachment.name)}
        {getFileDetails(attachment, dimensions)}
        {phaseLabelKey && (
          <>
            {' '}
            <LoadingEllipsis string={t(phaseLabelKey)} />
          </>
        )}
      </div>
      {commentMediaInfo && dimensions && (
        <div className={styles.fileThumbnail}>
          <CommentMedia
            commentMediaInfo={commentMediaInfo}
            linkHeight={dimensions.height}
            linkWidth={dimensions.width}
            showThumbnail={showThumbnail}
            setShowThumbnail={setShowThumbnail}
            spoiler={spoiler}
          />
        </div>
      )}
    </div>
  );
};

export default PendingUploadFile;
