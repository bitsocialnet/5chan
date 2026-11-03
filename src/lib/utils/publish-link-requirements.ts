import type { CommentGalleryItem } from '@bitsocial/bitsocial-react-hooks';
import type { TFunction } from 'i18next';
import { isPublishFileAttachment } from '../media-hosting/attached-media';
import type { AttachedMedia } from '../media-hosting/types';
import { isPublishFileMediaLink } from './media-link-validation-utils';
import { MAX_GALLERY_FILES } from './media-utils';
import { isValidPublishURL } from './url-utils';

interface PublishLinkFeatures {
  requirePostLink?: unknown;
  requirePostLinkIsMedia?: unknown;
  requireReplyLink?: unknown;
  requireReplyLinkIsMedia?: unknown;
  noReplyLinks?: unknown;
}

interface EffectivePostLinkFeatures {
  requirePostLink?: unknown;
  requirePostLinkIsMedia?: unknown;
}

interface EffectiveReplyLinkFeatures {
  requireReplyLink?: unknown;
  requireReplyLinkIsMedia?: unknown;
  noReplyLinks?: unknown;
}

export const getEffectivePostLinkFeatures = (
  communityFeatures: PublishLinkFeatures | undefined,
  directoryFeatures: PublishLinkFeatures | undefined,
): EffectivePostLinkFeatures | undefined => {
  const requirePostLink = communityFeatures?.requirePostLink ?? directoryFeatures?.requirePostLink;
  const requirePostLinkIsMedia = communityFeatures?.requirePostLinkIsMedia ?? directoryFeatures?.requirePostLinkIsMedia;

  if (requirePostLink === undefined && requirePostLinkIsMedia === undefined) {
    return undefined;
  }

  return {
    requirePostLink,
    requirePostLinkIsMedia,
  };
};

export const getEffectiveReplyLinkFeatures = (
  communityFeatures: PublishLinkFeatures | undefined,
  directoryFeatures: PublishLinkFeatures | undefined,
): EffectiveReplyLinkFeatures | undefined => {
  const requireReplyLink = communityFeatures?.requireReplyLink ?? directoryFeatures?.requireReplyLink;
  const requireReplyLinkIsMedia = communityFeatures?.requireReplyLinkIsMedia ?? directoryFeatures?.requireReplyLinkIsMedia;
  const noReplyLinks = communityFeatures?.noReplyLinks ?? directoryFeatures?.noReplyLinks;

  if (requireReplyLink === undefined && requireReplyLinkIsMedia === undefined && noReplyLinks === undefined) {
    return undefined;
  }

  return {
    requireReplyLink,
    requireReplyLinkIsMedia,
    noReplyLinks,
  };
};

export const getRequirePostLink = (features: EffectivePostLinkFeatures | undefined): boolean => Boolean(features?.requirePostLink);

export const getRequirePostLinkIsMedia = (features: EffectivePostLinkFeatures | undefined, useMediaDefault: boolean): boolean =>
  Boolean(features?.requirePostLinkIsMedia) || (features?.requirePostLinkIsMedia === undefined && useMediaDefault);

export const getRequireReplyLink = (features: EffectiveReplyLinkFeatures | undefined): boolean => Boolean(features?.requireReplyLink);

export const getRequireReplyLinkIsMedia = (features: EffectiveReplyLinkFeatures | undefined, useMediaDefault: boolean): boolean =>
  Boolean(features?.requireReplyLinkIsMedia) || (features?.requireReplyLinkIsMedia === undefined && useMediaDefault);

export const getNoReplyLinks = (features: EffectiveReplyLinkFeatures | undefined): boolean => Boolean(features?.noReplyLinks);

interface GalleryFeatures {
  maxPostGalleryItems?: unknown;
  maxReplyGalleryItems?: unknown;
}

/**
 * How many gallery files a post or reply may carry after its link's file. Boards allow none unless the owner sets a
 * maximum, and 5chan shows at most MAX_GALLERY_FILES, so it never offers to post more than it shows. A directory route
 * such as /v/ offers none: directories keep 4chan's one file per post, even when no candidate qualifies and the board
 * hosting it takes galleries.
 */
export const getMaxGalleryItems = (communityFeatures: GalleryFeatures | undefined, isReply: boolean, isInDirectoryRoute = false): number => {
  if (isInDirectoryRoute) return 0;
  const maxItems = communityFeatures?.[isReply ? 'maxReplyGalleryItems' : 'maxPostGalleryItems'];
  return typeof maxItems === 'number' && Number.isInteger(maxItems) && maxItems > 0 ? Math.min(maxItems, MAX_GALLERY_FILES) : 0;
};

const getTooManyFilesError = (maxGalleryItems: number, t: TFunction) => `${t('error')}: ${t('too_many_files_alert', { count: 1 + maxGalleryItems })}`;

/**
 * Checks the files a post sends: the first becomes its link and the rest its gallery, which the board caps and,
 * like every gallery, keeps to media, so several files must all be images or videos.
 */
export const getPostFilesValidationError = (files: AttachedMedia[], maxGalleryItems: number, t: TFunction): string | null => {
  if (files.length > 1 + maxGalleryItems) return getTooManyFilesError(maxGalleryItems, t);
  if (files.length > 1 && !files.every(isPublishFileAttachment)) return `${t('error')}: ${t('gallery_file_not_image_or_video_alert')}`;
  return null;
};

/**
 * Checks the gallery a form kept from an attempt the board did not take against the board it now posts to, which can
 * be another board, chosen on /all, or a board that lowered its limit since.
 */
export const getUploadedGalleryValidationError = (gallery: CommentGalleryItem[] | undefined, maxGalleryItems: number, t: TFunction): string | null =>
  gallery && gallery.length > maxGalleryItems ? getTooManyFilesError(maxGalleryItems, t) : null;

export const getPublishLinkValidationError = ({
  link,
  attachment,
  noLinks = false,
  requireLink,
  requireMedia,
  requiredLinkAlertKey,
  requiredMediaLinkAlertKey,
  noLinksAlertKey,
  t,
}: {
  link: string;
  /** A file that becomes the comment's link once it is uploaded at submit. */
  attachment?: AttachedMedia;
  noLinks?: boolean;
  requireLink: boolean;
  requireMedia: boolean;
  requiredLinkAlertKey: string;
  requiredMediaLinkAlertKey: string;
  noLinksAlertKey?: string;
  t: TFunction;
}): string | null => {
  if ((link || attachment) && noLinks && noLinksAlertKey) {
    return `${t('error')}: ${t(noLinksAlertKey)}`;
  }
  if (!link && !attachment && requireLink) {
    return `${t('error')}: ${t(requireMedia ? requiredMediaLinkAlertKey : requiredLinkAlertKey)}`;
  }
  if (attachment) {
    return requireMedia && !isPublishFileAttachment(attachment) ? `${t('error')}: ${t('link_not_image_or_video_alert')}` : null;
  }
  if (link && !isValidPublishURL(link)) {
    return `${t('error')}: ${t('invalid_url_alert')}`;
  }
  if (link && requireMedia && !isPublishFileMediaLink(link)) {
    return `${t('error')}: ${t('link_not_image_or_video_alert')}`;
  }

  return null;
};
