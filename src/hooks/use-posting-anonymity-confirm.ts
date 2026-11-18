import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDirectoryByAddress } from './use-directories';
import { useCommunityField } from './use-stable-community';

export type BoardAnonymity = 'anonymous' | 'not-anonymous' | 'unknown';

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

/**
 * 5chan shows no identity to its users, so posting is assumed anonymous. Returns a callback that lets a
 * post through on a board that anonymizes its posters and asks first on any other board, where the
 * device's Bitsocial identifier would be published with the post.
 */
const usePostingAnonymityConfirm = (communityAddress: string | undefined) => {
  const { t } = useTranslation();
  const directory = useDirectoryByAddress(communityAddress);
  const isBoardLoaded = useCommunityField(communityAddress, (community) => typeof community?.updatedAt === 'number') ?? false;
  const livePseudonymityMode = useCommunityField(communityAddress, (community) => community?.features?.pseudonymityMode);
  const anonymity = getBoardAnonymity({ isBoardLoaded, livePseudonymityMode, directoryPseudonymityMode: directory?.features?.pseudonymityMode });

  return useCallback(() => {
    // No board chosen yet: the form's own validation reports that.
    if (!communityAddress || anonymity === 'anonymous') return true;
    return window.confirm(t(anonymity === 'unknown' ? 'post_anonymity_unknown_confirm' : 'post_not_anonymous_confirm'));
  }, [anonymity, communityAddress, t]);
};

export default usePostingAnonymityConfirm;
