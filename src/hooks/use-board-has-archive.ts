import { useCommunityField } from './use-stable-community';

/**
 * A board whose community record sets features.noArchive has no archive, like 4chan /b/ and
 * /trash/: its threads are purged when they fall off the board instead of being archived.
 * Until the record loads the board is assumed to have one, as nearly every board does.
 */
export const useBoardHasArchive = (communityAddress: string | undefined): boolean =>
  useCommunityField(communityAddress, (community) => community?.features?.noArchive !== true) ?? true;
