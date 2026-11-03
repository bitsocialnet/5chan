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

const NONOKO_PENDING_ACCOUNT_COMMENT_INDEX_STATE_KEY = 'nonokoPendingAccountCommentIndex';

type NonokoPendingRouteState = {
  [NONOKO_PENDING_ACCOUNT_COMMENT_INDEX_STATE_KEY]?: unknown;
  usr?: unknown;
};

const getNonokoPendingAccountCommentIndexFromRecord = (state: NonokoPendingRouteState): number | undefined => {
  const value = state[NONOKO_PENDING_ACCOUNT_COMMENT_INDEX_STATE_KEY];
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
};

export const getNonokoPendingRouteState = (commentIndex: number) => ({
  [NONOKO_PENDING_ACCOUNT_COMMENT_INDEX_STATE_KEY]: commentIndex,
});

export const getNonokoPendingAccountCommentIndex = (state: unknown): number | undefined => {
  if (!state || typeof state !== 'object') return undefined;

  const directIndex = getNonokoPendingAccountCommentIndexFromRecord(state as NonokoPendingRouteState);
  if (directIndex !== undefined) return directIndex;

  const wrappedState = (state as NonokoPendingRouteState).usr;
  if (!wrappedState || typeof wrappedState !== 'object') return undefined;
  return getNonokoPendingAccountCommentIndexFromRecord(wrappedState as NonokoPendingRouteState);
};

/** Marks the board index a nonoko reply returns to; a nonoko thread's redirect carries its pending index instead. */
export const NONOKO_REPLY_ROUTE_STATE = { nonokoReply: true } as const;

export const isNonokoRedirectState = (state: unknown): boolean =>
  getNonokoPendingAccountCommentIndex(state) !== undefined || (!!state && typeof state === 'object' && (state as { nonokoReply?: unknown }).nonokoReply === true);
