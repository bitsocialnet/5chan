import { validateComment } from '@bitsocial/bitsocial-react-hooks';
import type { ProviderThreadVerifier } from './stats-provider-snapshot';

/**
 * Without a loaded community, validateComment proves the update was signed by the community the
 * author named in the signed comment. Checking that name against 5chan's own key for the board keeps
 * a provider from listing another board's thread under this one. A board whose signing key differs
 * from its address fails here, and the box falls back to P2P when no thread passes.
 */
export const verifyProviderThread: ProviderThreadVerifier = async (thread, board) => {
  // Only a board's threads can be popular threads, never a reply.
  if (thread.raw.comment.depth !== 0) return false;
  if (!board.publicKey || thread.raw.comment.communityPublicKey !== board.publicKey) return false;
  // The community's signature still covers the preloaded reply pages; the box never shows them.
  const result = await validateComment(thread, { validateReplies: false });
  return result.valid;
};
