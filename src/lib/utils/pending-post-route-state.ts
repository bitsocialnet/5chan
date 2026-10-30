import type { Comment } from '@bitsocial/bitsocial-react-hooks';

/** The pending page of a new thread whose file is still being checked and uploaded, so it has no account comment index yet. */
export const PENDING_UPLOAD_POST_INDEX = 'upload';
export const PENDING_UPLOAD_POST_PATH = `/pending/${PENDING_UPLOAD_POST_INDEX}`;

export const isPendingUploadPostPath = (pathname: string) => pathname.replace(/\/settings$/, '') === PENDING_UPLOAD_POST_PATH;

/**
 * The post the upload page shows: the one its navigation named while that one is still uploading, or the
 * latest one still uploading when the navigation named none.
 */
export const getShownPendingUploadId = (pendingUploadIds: number[], state: unknown): number | undefined => {
  const requestedId = state && typeof state === 'object' ? (state as { pendingUploadId?: unknown }).pendingUploadId : undefined;
  if (typeof requestedId === 'number') return pendingUploadIds.includes(requestedId) ? requestedId : undefined;
  return pendingUploadIds.at(-1);
};

export const getPendingPostRouteBoardPath = (state: unknown): string | undefined => {
  if (!state || typeof state !== 'object') {
    return undefined;
  }

  const boardPath = (state as { boardPath?: unknown }).boardPath;
  return typeof boardPath === 'string' && boardPath ? boardPath : undefined;
};

export const getPendingPostRoutePost = (state: unknown): Comment | undefined => {
  if (!state || typeof state !== 'object') {
    return undefined;
  }

  const pendingPost = (state as { pendingPost?: unknown }).pendingPost;
  return pendingPost && typeof pendingPost === 'object' ? (pendingPost as Comment) : undefined;
};
