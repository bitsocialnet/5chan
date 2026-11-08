import spoilerThumbnails from '../data/spoiler-thumbnails.json';
import { findDirectoryByAddress } from './utils/directories';
import type { DirectoryCommunity } from './utils/directory-list-utils';
import { getDirectoryCodeForBoardAddress } from './utils/directory-list-lookup-utils';

export const DEFAULT_SPOILER_THUMBNAIL = 'assets/spoiler.png';

/** Resolve the post's board, including candidate boards, independently of the current route. */
export const getSpoilerThumbnail = (communityAddress: string | undefined, directories: DirectoryCommunity[]): string => {
  const directory = findDirectoryByAddress(directories, communityAddress);
  const code = (directory?.directoryCode ?? directory?.title?.match(/^\/([^/]+)\//)?.[1] ?? getDirectoryCodeForBoardAddress(communityAddress))?.toLowerCase();
  const thumbnails: Readonly<Record<string, string>> = spoilerThumbnails;
  return code && Object.hasOwn(thumbnails, code) ? thumbnails[code] : DEFAULT_SPOILER_THUMBNAIL;
};
