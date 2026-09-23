import { vendoredDirectoryLists as directoryListsData, vendoredDirectoryDefaults as directoryDefaultsData } from './vendored-directory-lists';
import { isSpecialBoardAddress, isSpecialBoardCode } from '../special-boards';
import {
  directoryListToCommunity,
  isRecord,
  normalizeDirectoryList,
  normalizeDirectoryDefaultsData,
  sortDirectoryLists,
  toCanonicalCommunity,
  type DirectoriesData,
  type DirectoryDefaultsData,
  type DirectoryCommunity,
  type DirectoryList,
} from './directory-list-utils';
import { normalizeBoardAddress } from './directory-list-lookup-utils';

export interface DirectoriesMetadata {
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

const getDirectoryIdentifiers = (community: DirectoryCommunity): string[] => [
  ...new Set([community.address, community.name, community.publicKey].filter((value): value is string => typeof value === 'string' && value.length > 0)),
];

const dedupeCommunities = (entries: DirectoryCommunity[]): DirectoryCommunity[] => {
  const seenAddresses = new Set<string>();
  const normalizedEntries: DirectoryCommunity[] = [];

  for (const entry of entries) {
    const dedupeKey = entry.publicKey ?? entry.address;
    if (seenAddresses.has(dedupeKey)) {
      continue;
    }
    seenAddresses.add(dedupeKey);
    normalizedEntries.push(entry);
  }

  return normalizedEntries;
};

const isVisibleDirectoryCommunity = (community: DirectoryCommunity): boolean =>
  !isSpecialBoardCode(community.directoryCode) &&
  !isSpecialBoardAddress(community.address) &&
  !isSpecialBoardAddress(community.name) &&
  !isSpecialBoardAddress(community.publicKey);

const adaptDirectoryLists = (value: Record<string, unknown>): DirectoryCommunity[] => {
  if (!Array.isArray(value.directories)) {
    return [];
  }

  const lists = value.directories
    .map((directory) => {
      if (!isRecord(directory) || !Array.isArray(directory.boards) || typeof directory.directoryCode !== 'string') {
        return null;
      }
      return normalizeDirectoryList(directory, directory.directoryCode);
    })
    .filter((list): list is DirectoryList => list !== null);

  const communities = sortDirectoryLists(lists)
    .map(directoryListToCommunity)
    .filter((community): community is DirectoryCommunity => community !== null);

  return dedupeCommunities(communities);
};

const adaptV2Directories = (value: Record<string, unknown>): DirectoryCommunity[] => {
  if (!Array.isArray(value.directories)) {
    return [];
  }

  const communities = value.directories
    .map((directory) => {
      if (!isRecord(directory)) {
        return null;
      }
      const features = isRecord(directory.features) ? directory.features : null;
      return toCanonicalCommunity({
        communityAddress: directory.communityAddress,
        name: directory.name,
        publicKey: directory.publicKey,
        title: directory.title,
        directoryCode: directory.directoryCode,
        features,
      });
    })
    .filter((community): community is DirectoryCommunity => community !== null);

  return dedupeCommunities(communities);
};

export const findDirectoryByAddress = (directories: DirectoryCommunity[], address: string | undefined): DirectoryCommunity | undefined => {
  if (!address) {
    return undefined;
  }

  const exactMatch = directories.find((community) => community.address === address);
  if (exactMatch) {
    return exactMatch;
  }

  const exactIdentifierMatch = directories.find((community) => getDirectoryIdentifiers(community).includes(address));
  if (exactIdentifierMatch) {
    return exactIdentifierMatch;
  }

  const normalizedAddress = normalizeBoardAddress(address);
  const normalizedMatch = directories.find((community) =>
    getDirectoryIdentifiers(community).some((identifier) => normalizeBoardAddress(identifier) === normalizedAddress),
  );
  if (normalizedMatch) {
    return normalizedMatch;
  }

  return undefined;
};

const adaptV1Communities = (value: Record<string, unknown>): DirectoryCommunity[] => {
  if (!Array.isArray(value.communities)) {
    return [];
  }

  const communities = value.communities
    .map((community) => {
      if (!isRecord(community)) {
        return null;
      }
      return toCanonicalCommunity({
        address: community.address,
        name: community.name,
        publicKey: community.publicKey,
        title: community.title,
        nsfw: community.nsfw,
        directoryCode: community.directoryCode,
        features: community.features,
      });
    })
    .filter((community): community is DirectoryCommunity => community !== null);

  return dedupeCommunities(communities);
};

export const getDirectoriesMetadata = (value: unknown): DirectoriesMetadata => {
  if (!isRecord(value)) {
    return {
      title: '',
      description: '',
      createdAt: 0,
      updatedAt: 0,
    };
  }

  return {
    title: typeof value.title === 'string' ? value.title : '',
    description: typeof value.description === 'string' ? value.description : '',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
};

export const normalizeDirectoriesData = (value: unknown): DirectoriesData | null => {
  if (!isRecord(value)) {
    return null;
  }

  const adapters: Array<(raw: Record<string, unknown>) => DirectoryCommunity[]> = [adaptDirectoryLists, adaptV2Directories, adaptV1Communities];
  const communities = (adapters.map((adapter) => adapter(value)).find((normalized) => normalized.length > 0) ?? []).filter(isVisibleDirectoryCommunity);

  if (communities.length === 0) {
    return null;
  }

  const fallbackMetadata = getDirectoriesMetadata(directoryListsData as unknown);
  return {
    title: typeof value.title === 'string' ? value.title : fallbackMetadata.title,
    description: typeof value.description === 'string' ? value.description : fallbackMetadata.description,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : fallbackMetadata.createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : fallbackMetadata.updatedAt,
    communities,
  };
};

export const toDirectoriesMetadata = (data: DirectoriesData): DirectoriesMetadata => ({
  title: data.title,
  description: data.description,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
});

let fallbackDirectoriesData: DirectoriesData | null = null;
let fallbackDirectoryDefaults: DirectoryDefaultsData | null = null;

export const getFallbackDirectoryDefaults = (): DirectoryDefaultsData => {
  if (fallbackDirectoryDefaults) return fallbackDirectoryDefaults;
  fallbackDirectoryDefaults = normalizeDirectoryDefaultsData(directoryDefaultsData as unknown);
  return fallbackDirectoryDefaults;
};

export const getFallbackDirectoriesData = (): DirectoriesData => {
  if (fallbackDirectoriesData) return fallbackDirectoriesData;
  const normalized = normalizeDirectoriesData(directoryListsData as unknown);
  const metadata = getDirectoriesMetadata(directoryListsData as unknown);
  fallbackDirectoriesData = normalized ?? {
    ...metadata,
    communities: [],
  };
  return fallbackDirectoriesData;
};
