// Kept apart from comment-transfer.ts, whose helpers only the transfer modal and Trash buttons need, so the app
// layout's transfer store does not pull them into the first page load.
export type PostTransferState = 'idle' | 'publishing' | 'succeeded' | 'failed' | 'finalizationFailed';

// A succeeded or finalization-failed transfer already left a copy in /trash/, so the post must not be moved again.
export const isTerminalTransferState = (state: PostTransferState | undefined): boolean => state === 'succeeded' || state === 'finalizationFailed';
