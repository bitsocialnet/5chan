import type { AttachedMedia } from './types';

// The image and video formats the file pickers offer (SWF is the one non-media type they also take).
const PUBLISH_FILE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']);
const PUBLISH_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm']);

/** Whether an attachment meets a media-only board's requirement (image, GIF or video, not e.g. SWF). */
export const isPublishFileAttachment = (media: AttachedMedia): boolean => {
  if (media.mimeType) return PUBLISH_FILE_MIME_TYPES.has(media.mimeType);
  // Some Android content providers report no MIME type, so fall back to the file name.
  return PUBLISH_FILE_EXTENSIONS.has(media.name.split('.').pop()?.toLowerCase() ?? '');
};

export const getFileAttachment = (file: File): AttachedMedia => ({ kind: 'file', file, name: file.name, mimeType: file.type });
