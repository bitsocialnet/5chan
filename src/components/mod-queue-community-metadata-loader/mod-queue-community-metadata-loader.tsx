import { memo } from 'react';
import { useCommunities } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifiers';

// Loads each candidate mod queue board once, without rendering anything, so the
// account's moderator roles are found. Roles are only read, and a board shown
// elsewhere is already updating, so the candidates are not kept updating.
// Shared by the mod queue route and the mod-queue button outside board pages.
const ModQueueCommunityMetadataLoader = memo(({ candidateCommunityAddresses }: { candidateCommunityAddresses: string[] }) => {
  const candidateCommunities = useCommunityIdentifiers(candidateCommunityAddresses);
  useCommunities(candidateCommunities.length > 0 ? { communities: candidateCommunities, autoUpdate: false } : undefined);
  return null;
});

export default ModQueueCommunityMetadataLoader;
