import type { CommentGalleryItem } from '@bitsocial/bitsocial-react-hooks';
import { getLinkMediaInfo } from '../utils/media-utils';
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

// A dropped or pasted file skips the picker's `accept` filter, so check it the same way, with the file-name
// fallback for files the OS reports with an empty or generic MIME type.
const isAcceptedUploadFile = (file: File) => {
  const media = getFileAttachment(file);
  return isPublishFileAttachment(media) || SWF_MIME_TYPES.has(media.mimeType) || media.name.toLowerCase().endsWith('.swf');
};

// Structural, so React's synthetic drag events fit without lib depending on React.
export type FileDragEvent = { dataTransfer: DataTransfer; preventDefault: () => void };

const isFileDrag = (event: FileDragEvent) => event.dataTransfer.types.includes('Files');

/**
 * Drag-and-drop props for a form area, so files dropped on it are attached like ones chosen with the picker:
 * all of them when `multiple`, else the first. Text drags pass through untouched. File drops are always
 * cancelled, so files dropped while attaching is disabled or an upload runs are ignored instead of the browser
 * opening them, and a drop with a file of an unsupported type is reported through `onUnsupportedFile`, since
 * the picker never offers it.
 */
export function getFileDropHandlers(onDropFiles: (media: AttachedMedia[]) => void, enabled: boolean, onUnsupportedFile?: () => void, multiple = false) {
  return {
    onDragOver: (event: FileDragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
    },
    onDrop: (event: FileDragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files).slice(0, multiple ? undefined : 1);
      if (!enabled || files.length === 0) return;
      if (files.every(isAcceptedUploadFile)) onDropFiles(files.map(getFileAttachment));
      else onUnsupportedFile?.();
    },
  };
}

// Structural, so React's synthetic clipboard events fit without lib depending on React.
export type FilePasteEvent = { clipboardData: DataTransfer | null; preventDefault: () => void };

// Finder leaves a hidden extension out of the copied file's name.
const isFileNamed = (file: File, name: string) => name === file.name || name === file.name.replace(/\.[^.]*$/, '');

// Firefox and Safari put a copied image's address in the text, next to an <img> of it in the HTML. The text
// can be a srcset candidate rather than the src, so any image in the HTML counts.
const isCopiedImageAddress = (clipboardData: DataTransfer, text: string) => {
  if (!/^https?:\/\/\S+$/i.test(text)) return false;
  const html = clipboardData.getData('text/html');
  return html !== '' && new DOMParser().parseFromString(html, 'text/html').images.length > 0;
};

/**
 * The files a paste carries, when the text it would insert is nothing (a copied image or screenshot), a copied
 * image's address, or only the names of the copied files (files copied in Finder or Explorer, which can come
 * with an image of their icon, so the named files are taken, in the order named). Office apps copy rich text
 * with a rendered image of it, so a paste with any other text, whitespace included, stays a text paste.
 */
const getPastedFiles = (clipboardData: DataTransfer): File[] => {
  const files = Array.from(clipboardData.files);
  const text = clipboardData.getData('text/plain');
  if (text === '') return files;
  const textLines = text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (textLines.length > 0 && textLines.every((line) => files.some((file) => isFileNamed(file, line)))) {
    return textLines.flatMap((line) => files.find((file) => isFileNamed(file, line)) ?? []);
  }
  if (files.length === 1 && textLines.length === 1 && isCopiedImageAddress(clipboardData, textLines[0])) return files;
  return [];
};

/**
 * A paste handler for the comment field, so copied images or files are attached like ones chosen with the picker,
 * all of them when `multiple`, else the first, instead of their names being pasted as text. Pastes are left to the
 * browser while attaching is disabled, and a paste with a file of an unsupported type is reported through
 * `onUnsupportedFile`.
 */
export function getFilePasteHandler(onPasteFiles: (media: AttachedMedia[]) => void, enabled: boolean, onUnsupportedFile?: () => void, multiple = false) {
  return (event: FilePasteEvent) => {
    if (!enabled || !event.clipboardData) return;
    const files = getPastedFiles(event.clipboardData).slice(0, multiple ? undefined : 1);
    if (files.length === 0) return;
    event.preventDefault();
    if (files.every(isAcceptedUploadFile)) onPasteFiles(files.map(getFileAttachment));
    else onUnsupportedFile?.();
  };
}

type MediaDimensions = { width: number; height: number };

/** An image's or video's pixel size, read from a URL the page can load, or nothing when it doesn't load in time. */
export const readMediaDimensions = (url: string, mediaType: 'image' | 'video', timeoutMs = 10_000): Promise<MediaDimensions | undefined> =>
  new Promise((resolve) => {
    const element = mediaType === 'image' ? new Image() : document.createElement('video');
    const settle = (width: number, height: number) => {
      window.clearTimeout(timeoutId);
      element.onload = element.onerror = null;
      if (element instanceof HTMLVideoElement) element.onloadedmetadata = null;
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    const timeoutId = window.setTimeout(() => settle(0, 0), timeoutMs);
    element.onerror = () => settle(0, 0);
    if (element instanceof HTMLVideoElement) {
      element.preload = 'metadata';
      element.muted = true;
      element.onloadedmetadata = () => settle(element.videoWidth, element.videoHeight);
    } else {
      element.onload = () => settle(element.naturalWidth, element.naturalHeight);
    }
    element.src = url;
  });

// The size is optional in a gallery item, so a file whose size can't be read is posted without it.
const readAttachedMediaDimensions = async (media: AttachedMedia): Promise<MediaDimensions | undefined> => {
  const mediaType = media.mimeType.startsWith('image/') ? 'image' : media.mimeType.startsWith('video/') ? 'video' : undefined;
  if (!mediaType) return undefined;
  // A file picked on Android stays native-side; its web path already serves it to the WebView.
  if (media.kind === 'picked') return readMediaDimensions(media.webPath, mediaType);
  let url: string | undefined;
  try {
    url = URL.createObjectURL(media.file);
    return await readMediaDimensions(url, mediaType);
  } catch {
    return undefined;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
};

const GALLERY_TAG_BY_LINK_TYPE: Record<string, CommentGalleryItem['htmlTagName']> = { image: 'img', gif: 'img', video: 'video', audio: 'audio' };

/**
 * The comment.gallery item for an uploaded file. The board checks the tag against the URL's extension, so that
 * decides it, with the file's own type as the fallback. The file's pixel size lets every client lay the gallery
 * out before it loads, since boards make no thumbnails for gallery files.
 */
export const getUploadedGalleryItem = (media: AttachedMedia, url: string, dimensions: MediaDimensions | undefined): CommentGalleryItem => {
  const htmlTagName = GALLERY_TAG_BY_LINK_TYPE[getLinkMediaInfo(url)?.type ?? ''] ?? (media.mimeType.startsWith('video/') ? 'video' : 'img');
  return { url, htmlTagName, ...(htmlTagName === 'audio' ? undefined : dimensions) };
};

/**
 * Uploads a post's gallery files in order with `upload`, which reports its own failures, and returns their
 * gallery items, or null as soon as one fails or `shouldContinue` says the post was abandoned, so no file is
 * uploaded for a post that will not be published.
 */
export const uploadGalleryAttachments = async (
  attachments: AttachedMedia[],
  upload: (media: AttachedMedia) => Promise<{ url: string } | null>,
  shouldContinue: () => boolean,
): Promise<CommentGalleryItem[] | null> => {
  const items: CommentGalleryItem[] = [];
  for (const media of attachments) {
    if (!shouldContinue()) return null;
    // The size comes from the local file, so it is read while the file uploads.
    const dimensions = readAttachedMediaDimensions(media);
    const uploaded = await upload(media);
    if (!uploaded) return null;
    items.push(getUploadedGalleryItem(media, uploaded.url, await dimensions));
  }
  return items;
};
