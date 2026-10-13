import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBestAvailableYouTubeThumbnailUrlFromLink,
  getVimeoThumbnailFileUrlFromLink,
  getYouTubeThumbnailUrlFromLink,
  isVimeoVideoLink,
} from '../lib/utils/media-utils';

const VIDEO_THUMBNAIL_LINK_CONVERSION_DELAY_SECONDS = 3;
const VIDEO_THUMBNAIL_LINK_CONVERSION_INTERVAL_MS = 1000;

type ElementRef<T extends HTMLElement> = {
  readonly current: T | null;
};

export type VideoThumbnailLinkSite = 'youtube' | 'vimeo';

interface PendingVideoThumbnailLinkConversion {
  site: VideoThumbnailLinkSite;
  thumbnailLinkPromise: Promise<string | undefined>;
  videoLink: string;
}

interface VideoThumbnailLinkConversionNotice {
  countdown: number;
  site: VideoThumbnailLinkSite;
}

interface UseVideoThumbnailLinkConversionOptions {
  enabled: boolean;
  onContentChange: (content: string, selectionStart: number, selectionEnd: number) => void;
  onLinkChange: (link: string) => void;
  textRef: ElementRef<HTMLTextAreaElement>;
  urlRef: ElementRef<HTMLInputElement>;
}

const clampSelectionPosition = (position: number | null | undefined, contentLength: number): number => {
  if (typeof position !== 'number' || Number.isNaN(position)) return contentLength;
  return Math.max(0, Math.min(position, contentLength));
};

const getContentWithInsertedVideoLink = (content: string, videoLink: string, selectionStart?: number | null, selectionEnd?: number | null) => {
  const start = clampSelectionPosition(selectionStart, content.length);
  const end = Math.max(start, clampSelectionPosition(selectionEnd, content.length));
  const before = content.slice(0, start);
  const after = content.slice(end);
  const leadingSeparator = before && !/\s$/.test(before) ? ' ' : '';
  const trailingSeparator = after && !/^\s/.test(after) ? ' ' : '';
  const insertedText = `${leadingSeparator}${videoLink}${trailingSeparator}`;
  const nextSelection = before.length + insertedText.length;

  return {
    content: `${before}${insertedText}${after}`,
    selectionEnd: nextSelection,
    selectionStart: nextSelection,
  };
};

const getPendingConversion = (link: string): PendingVideoThumbnailLinkConversion | null => {
  const videoLink = link.trim();
  if (!videoLink) {
    return null;
  }

  const preferredYouTubeThumbnailLink = getYouTubeThumbnailUrlFromLink(videoLink);
  if (preferredYouTubeThumbnailLink) {
    return videoLink === preferredYouTubeThumbnailLink
      ? null
      : { site: 'youtube', thumbnailLinkPromise: getBestAvailableYouTubeThumbnailUrlFromLink(videoLink), videoLink };
  }

  return isVimeoVideoLink(videoLink) ? { site: 'vimeo', thumbnailLinkPromise: getVimeoThumbnailFileUrlFromLink(videoLink), videoLink } : null;
};

export const useVideoThumbnailLinkConversion = ({ enabled, onContentChange, onLinkChange, textRef, urlRef }: UseVideoThumbnailLinkConversionOptions) => {
  const [notice, setNotice] = useState<VideoThumbnailLinkConversionNotice | null>(null);
  const pendingConversionRef = useRef<PendingVideoThumbnailLinkConversion | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearCountdownTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelPendingConversion = useCallback(() => {
    clearCountdownTimer();
    pendingConversionRef.current = null;
    setNotice(null);
  }, [clearCountdownTimer]);

  const applyPendingConversion = useCallback(async () => {
    if (!enabled) {
      cancelPendingConversion();
      return false;
    }

    const currentLink = urlRef.current?.value.trim() || '';
    const pendingConversion = pendingConversionRef.current ?? getPendingConversion(currentLink);
    if (!pendingConversion || currentLink !== pendingConversion.videoLink) {
      cancelPendingConversion();
      return false;
    }

    const thumbnailLink = await pendingConversion.thumbnailLinkPromise;
    const latestLink = urlRef.current?.value.trim() || '';
    if (!thumbnailLink || latestLink !== pendingConversion.videoLink) {
      cancelPendingConversion();
      return false;
    }

    clearCountdownTimer();
    pendingConversionRef.current = null;
    setNotice(null);

    const textarea = textRef.current;
    const currentContent = textarea?.value || '';
    const nextContent = getContentWithInsertedVideoLink(currentContent, pendingConversion.videoLink, textarea?.selectionStart, textarea?.selectionEnd);

    if (textarea) {
      textarea.value = nextContent.content;
      textarea.setSelectionRange(nextContent.selectionStart, nextContent.selectionEnd);
    }
    if (urlRef.current) {
      urlRef.current.value = thumbnailLink;
    }

    onContentChange(nextContent.content, nextContent.selectionStart, nextContent.selectionEnd);
    onLinkChange(thumbnailLink);
    return true;
  }, [cancelPendingConversion, clearCountdownTimer, enabled, onContentChange, onLinkChange, textRef, urlRef]);

  const scheduleConversionCountdown = useCallback(
    (remainingSeconds: number) => {
      clearCountdownTimer();

      const tick = (seconds: number) => {
        const pendingConversion = pendingConversionRef.current;
        if (!pendingConversion) {
          setNotice(null);
          return;
        }

        if (seconds <= 0) {
          void applyPendingConversion();
          return;
        }

        setNotice({ countdown: seconds, site: pendingConversion.site });
        timeoutRef.current = window.setTimeout(() => tick(seconds - 1), VIDEO_THUMBNAIL_LINK_CONVERSION_INTERVAL_MS);
      };

      tick(remainingSeconds);
    },
    [applyPendingConversion, clearCountdownTimer],
  );

  const queueLinkConversion = useCallback(
    (link: string) => {
      if (!enabled) {
        cancelPendingConversion();
        return false;
      }

      const pendingConversion = getPendingConversion(link);
      if (!pendingConversion) {
        cancelPendingConversion();
        return false;
      }

      if (pendingConversionRef.current?.videoLink === pendingConversion.videoLink) {
        return true;
      }

      pendingConversionRef.current = pendingConversion;
      scheduleConversionCountdown(VIDEO_THUMBNAIL_LINK_CONVERSION_DELAY_SECONDS);
      return true;
    },
    [cancelPendingConversion, enabled, scheduleConversionCountdown],
  );

  useEffect(() => {
    if (!enabled) {
      cancelPendingConversion();
    }
  }, [cancelPendingConversion, enabled]);

  useEffect(
    () => () => {
      clearCountdownTimer();
      pendingConversionRef.current = null;
    },
    [clearCountdownTimer],
  );

  return {
    applyPendingConversion,
    cancelPendingConversion,
    notice,
    queueLinkConversion,
  };
};
