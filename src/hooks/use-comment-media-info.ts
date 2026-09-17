import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getCommentMediaInfo, fetchWebpageThumbnailIfNeeded, CommentMediaInfo } from '../lib/utils/media-utils';
import { isPendingPostView, isPostPageView } from '../lib/utils/view-utils';
import { useFeedCacheContext } from './use-feed-cache-context';

/**
 * Hook to fetch and cache media info with thumbnail dimensions for comments.
 * Properly tracks thumbnail dimensions using state so they're available after the image loads.
 */
export const useCommentMediaInfo = (link: string, thumbnailUrl: string, linkWidth: number, linkHeight: number): CommentMediaInfo | undefined => {
  const location = useLocation();
  const params = useParams();
  const isCachedFeed = useFeedCacheContext();
  const isInPostPageView = isPostPageView(location.pathname, params);
  const isInPendingPostView = isPendingPostView(location.pathname, params);

  const [thumbnailDimensions, setThumbnailDimensions] = useState<{ width: number; height: number } | null>(null);

  // Fetch and cache thumbnail dimensions for webpage media
  useEffect(() => {
    // The live route can be a thread while this media still belongs to a hidden feed.
    if (isCachedFeed || !(isInPostPageView || isInPendingPostView)) return;

    // Reset dimensions when inputs change to avoid stale state
    setThumbnailDimensions(null);

    let isMounted = true;
    let img: HTMLImageElement | null = null;

    const fetchAndCacheThumbnail = async () => {
      const mediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);

      if (mediaInfo?.type === 'webpage' && !mediaInfo.thumbnail) {
        const newMediaInfo = await fetchWebpageThumbnailIfNeeded(mediaInfo);

        if (newMediaInfo.thumbnail && isMounted) {
          img = new Image();

          const handleLoad = () => {
            // Only update state if component is still mounted and this is the latest request
            if (isMounted && img) {
              setThumbnailDimensions({ width: img.width, height: img.height });
            }
          };

          const handleError = () => {
            // Silently handle failed image loads
          };

          img.onload = handleLoad;
          img.onerror = handleError;
          img.src = newMediaInfo.thumbnail;
        }
      }
    };

    fetchAndCacheThumbnail();

    // Cleanup function to prevent memory leaks and race conditions
    return () => {
      isMounted = false;
      if (img) {
        // Remove event handlers to prevent them from being called after cleanup
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [link, thumbnailUrl, linkWidth, linkHeight, isCachedFeed, isInPostPageView, isInPendingPostView]);

  return useMemo(() => {
    const mediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
    if (thumbnailDimensions && mediaInfo) {
      return {
        ...mediaInfo,
        thumbnailWidth: thumbnailDimensions.width,
        thumbnailHeight: thumbnailDimensions.height,
      };
    }
    return mediaInfo;
  }, [link, thumbnailUrl, linkWidth, linkHeight, thumbnailDimensions]);
};
