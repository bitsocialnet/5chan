import type { TFunction } from 'i18next';
import { isPublishFileAttachment } from '../media-hosting/attached-media';
import type { AttachedMedia } from '../media-hosting/types';
import { isPublishFileMediaLink } from './media-link-validation-utils';
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

// A community's own setting wins; the directory entry fills in what the community leaves unset.
const pickFeature = (
  key: keyof PublishLinkFeatures,
  communityFeatures: PublishLinkFeatures | undefined,
  directoryFeatures: PublishLinkFeatures | undefined,
): unknown => communityFeatures?.[key] || directoryFeatures?.[key];

export const getEffectivePostLinkFeatures = (
  communityFeatures: PublishLinkFeatures | undefined,
  directoryFeatures: PublishLinkFeatures | undefined,
): EffectivePostLinkFeatures | undefined => {
  const requirePostLink = pickFeature('requirePostLink', communityFeatures, directoryFeatures);
  const requirePostLinkIsMedia = pickFeature('requirePostLinkIsMedia', communityFeatures, directoryFeatures);

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
  const requireReplyLink = pickFeature('requireReplyLink', communityFeatures, directoryFeatures);
  const requireReplyLinkIsMedia = pickFeature('requireReplyLinkIsMedia', communityFeatures, directoryFeatures);
  const noReplyLinks = pickFeature('noReplyLinks', communityFeatures, directoryFeatures);

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
