import type { AttachedMedia } from './types';

/** Whether an attachment meets a media-only board's requirement (image, GIF or video, not e.g. SWF). */
export const isPublishFileAttachment = (media: AttachedMedia): boolean => media.mimeType.startsWith('image/') || media.mimeType.startsWith('video/');

export const getFileAttachment = (file: File): AttachedMedia => ({ kind: 'file', file, name: file.name, mimeType: file.type });
