import type { AttachedMedia } from './types';

// The image and video formats the file pickers offer (SWF is the one non-media type they also take).
const PUBLISH_FILE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']);
const PUBLISH_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm']);
const SWF_MIME_TYPES = new Set(['application/x-shockwave-flash', 'application/vnd.adobe.flash.movie']);

/** Whether an attachment meets a media-only board's requirement (image, GIF or video, not e.g. SWF). */
export const isPublishFileAttachment = (media: AttachedMedia): boolean => {
  if (PUBLISH_FILE_MIME_TYPES.has(media.mimeType)) return true;
  if (SWF_MIME_TYPES.has(media.mimeType)) return false;
  // Some Android content providers report no MIME type, or a generic or nonstandard one
  // (application/octet-stream, image/jpg), so fall back to the file name.
  return PUBLISH_FILE_EXTENSIONS.has(media.name.split('.').pop()?.toLowerCase() ?? '');
};

export const getFileAttachment = (file: File): AttachedMedia => ({ kind: 'file', file, name: file.name, mimeType: file.type });

/** The `accept` list for the upload file picker. */
export const UPLOAD_FILE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,.swf,application/x-shockwave-flash,application/vnd.adobe.flash.movie';

// A dropped file skips the picker's `accept` filter, so check it the same way, with the file-name
// fallback for files the OS reports with an empty or generic MIME type.
const isAcceptedUploadFile = (file: File) => {
  const media = getFileAttachment(file);
  return isPublishFileAttachment(media) || SWF_MIME_TYPES.has(media.mimeType) || media.name.toLowerCase().endsWith('.swf');
};

// Structural, so React's synthetic drag events fit without lib depending on React.
export type FileDragEvent = { dataTransfer: DataTransfer; preventDefault: () => void };

const isFileDrag = (event: FileDragEvent) => event.dataTransfer.types.includes('Files');

/**
 * Drag-and-drop props for a form area, so a file dropped on it is attached like one chosen with the picker.
 * Text drags pass through untouched. File drops are always cancelled, so a file dropped while attaching is
 * disabled or an upload runs is ignored instead of the browser opening it, and one of an unsupported type
 * is reported through `onUnsupportedFile`, since the picker never offers it.
 */
export function getFileDropHandlers(onDropFile: (media: AttachedMedia) => void, enabled: boolean, onUnsupportedFile?: () => void) {
  return {
    onDragOver: (event: FileDragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
    },
    onDrop: (event: FileDragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (!enabled || !file) return;
      if (isAcceptedUploadFile(file)) onDropFile(getFileAttachment(file));
      else onUnsupportedFile?.();
    },
  };
}
