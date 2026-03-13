import { useDirectoryByAddress } from './use-directories';
import { useCommunityField } from './use-stable-community';

/**
 * Prefer authoritative live board metadata when available, but fall back to the
 * bundled directory entry so known boards can render IDs immediately on first load.
 */
export const useBoardPseudonymityMode = (communityAddress: string | undefined): string | undefined => {
  const directory = useDirectoryByAddress(communityAddress);
  const livePseudonymityMode = useCommunityField(communityAddress, (community) => community?.features?.pseudonymityMode);

  return livePseudonymityMode ?? directory?.features?.pseudonymityMode;
};
