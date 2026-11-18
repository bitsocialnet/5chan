import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { useDirectoryByAddress } from './use-directories';
import { getCurrentCommunity } from './use-stable-community';

export type BoardAnonymity = 'anonymous' | 'not-anonymous' | 'unknown';

interface CommunitySnapshot {
  updatedAt?: unknown;
  features?: { pseudonymityMode?: string };
  roles?: Record<string, { role?: string } | undefined>;
}

// pkc-js publishes a post by the board's owner, an admin or a moderator under its own key even on a board
// that anonymizes everyone else.
const PSEUDONYMITY_EXEMPT_ROLES = new Set(['owner', 'admin', 'moderator']);

/**
 * Whether a board replaces a poster's key with an alias before publishing the post. The board's own
 * settings decide once they have loaded, so a directory entry written while the board still anonymized
 * cannot hide that it stopped; until then the entry is the only evidence.
 */
export const getBoardAnonymity = ({
  isBoardLoaded,
  livePseudonymityMode,
  directoryPseudonymityMode,
}: {
  isBoardLoaded: boolean;
  livePseudonymityMode: string | undefined;
  directoryPseudonymityMode: string | undefined;
}): BoardAnonymity => {
  const isMode = (mode: string | undefined) => Boolean(mode) && mode !== 'none';
  if (isBoardLoaded) return isMode(livePseudonymityMode) ? 'anonymous' : 'not-anonymous';
  return isMode(directoryPseudonymityMode) ? 'anonymous' : 'unknown';
};

// Boards key roles by a signer address or by a name the author posts under, so both are checked.
export const isPseudonymityExempt = (roles: CommunitySnapshot['roles'], authorAddresses: Array<string | undefined>): boolean =>
  authorAddresses.some((address) => Boolean(address) && PSEUDONYMITY_EXEMPT_ROLES.has(roles?.[address as string]?.role ?? ''));

/**
 * 5chan shows no identity to its users, so posting is assumed anonymous. Returns a callback that lets a
 * post through on a board that anonymizes this poster and asks first otherwise, where the device's
 * Bitsocial identifier, and a 5chan Pass wallet if one is logged in, would be published with the post.
 */
const usePostingAnonymityConfirm = (communityAddress: string | undefined) => {
  const { t } = useTranslation();
  const account = useAccount();
  const authorAddress: string | undefined = account?.author?.address;
  const signerAddress: string | undefined = account?.signer?.address;
  const directoryPseudonymityMode = useDirectoryByAddress(communityAddress)?.features?.pseudonymityMode;

  return useCallback(() => {
    // No board chosen yet: the form's own validation reports that.
    if (!communityAddress) return true;
    // Read the board as it is now rather than as it was rendered: a submit awaits its media checks before
    // asking, and the board's settings or roles can load in the meantime.
    const community = getCurrentCommunity(communityAddress) as CommunitySnapshot | undefined;
    if (isPseudonymityExempt(community?.roles, [authorAddress, signerAddress])) return window.confirm(t('post_as_board_staff_confirm'));
    const anonymity = getBoardAnonymity({
      isBoardLoaded: typeof community?.updatedAt === 'number',
      livePseudonymityMode: community?.features?.pseudonymityMode,
      directoryPseudonymityMode,
    });
    if (anonymity === 'anonymous') return true;
    return window.confirm(t(anonymity === 'unknown' ? 'post_anonymity_unknown_confirm' : 'post_not_anonymous_confirm'));
  }, [authorAddress, communityAddress, directoryPseudonymityMode, signerAddress, t]);
};

export default usePostingAnonymityConfirm;
