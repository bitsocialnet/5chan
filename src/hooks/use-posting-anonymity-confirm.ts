import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { getEquivalentCommunityAddressGroupKey } from '../lib/bitsocial-internals/utils';
import { getCurrentCommunity } from './use-stable-community';

export type BoardAnonymity = 'anonymous' | 'not-anonymous' | 'unknown';

interface CommunitySnapshot {
  updatedAt?: unknown;
  features?: { pseudonymityMode?: string };
  roles?: Record<string, { role?: string } | undefined>;
}

// The role the hooks library saved for this device on each board it has loaded, keyed by board address.
type RecordedBoardRoles = Record<string, { role?: { role?: string } } | undefined>;

// pkc-js publishes a post by the board's owner, an admin or a moderator under its own key even on a board
// that anonymizes everyone else.
const PSEUDONYMITY_EXEMPT_ROLES = new Set(['owner', 'admin', 'moderator']);

/**
 * Whether a board replaces a poster's key with an alias before publishing the post. Only the board's own
 * settings count: a directory entry can predate the board turning anonymity off, so until the settings
 * have loaded the answer is unknown.
 */
export const getBoardAnonymity = ({ isBoardLoaded, livePseudonymityMode }: { isBoardLoaded: boolean; livePseudonymityMode: string | undefined }): BoardAnonymity => {
  if (!isBoardLoaded) return 'unknown';
  return livePseudonymityMode && livePseudonymityMode !== 'none' ? 'anonymous' : 'not-anonymous';
};

// Boards key roles by a signer address or by a name the author posts under, so both are checked.
export const isPseudonymityExempt = (roles: CommunitySnapshot['roles'], authorAddresses: Array<string | undefined>): boolean =>
  authorAddresses.some((address) => Boolean(address) && PSEUDONYMITY_EXEMPT_ROLES.has(roles?.[address as string]?.role ?? ''));

// Saved with the device's data, so it answers before the board's own record has loaded.
export const hasRecordedExemptRole = (recordedRoles: RecordedBoardRoles | undefined, communityAddress: string): boolean => {
  if (!recordedRoles) return false;
  const boardKey = getEquivalentCommunityAddressGroupKey(communityAddress);
  return Object.entries(recordedRoles).some(
    ([address, entry]) => getEquivalentCommunityAddressGroupKey(address) === boardKey && PSEUDONYMITY_EXEMPT_ROLES.has(entry?.role?.role ?? ''),
  );
};

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
  const recordedRoles: RecordedBoardRoles | undefined = account?.communities;

  return useCallback(() => {
    // No board chosen yet: the form's own validation reports that.
    if (!communityAddress) return true;
    // Read the board as it is now rather than as it was rendered: a submit awaits its media checks before
    // asking, and the board's settings or roles can load in the meantime.
    const community = getCurrentCommunity(communityAddress) as CommunitySnapshot | undefined;
    const isBoardLoaded = typeof community?.updatedAt === 'number';
    // Until the board's record loads its roles are unknown, so the role this device saved the last time it
    // loaded the board stands in, and staff are told the real reason they are asked.
    const isStaff = isPseudonymityExempt(community?.roles, [authorAddress, signerAddress]) || (!isBoardLoaded && hasRecordedExemptRole(recordedRoles, communityAddress));
    if (isStaff) return window.confirm(t('post_as_board_staff_confirm'));
    const anonymity = getBoardAnonymity({ isBoardLoaded, livePseudonymityMode: community?.features?.pseudonymityMode });
    if (anonymity === 'anonymous') return true;
    return window.confirm(t(anonymity === 'unknown' ? 'post_anonymity_unknown_confirm' : 'post_not_anonymous_confirm'));
  }, [authorAddress, communityAddress, recordedRoles, signerAddress, t]);
};

export default usePostingAnonymityConfirm;
