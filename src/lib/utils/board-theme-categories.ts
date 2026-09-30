import { getSpecialBoardByAddress, SPECIAL_BOARDS } from '../special-boards';
import { getFallbackDirectoriesData } from './directories';
import { deriveCommunityNsfw } from './directory-list-utils';
import { getCommunityAddress } from './route-utils';
import { vendoredDirectoryLists } from './vendored-directory-lists';

export type BoardThemeCategory = 'nsfw' | 'sfw';

export interface BoardThemeCategories {
  codes: Record<string, BoardThemeCategory>;
  addresses: Record<string, BoardThemeCategory>;
}

/**
 * The theme category useTheme gives each directory code and candidate board address on React's
 * first commit, before live community data can override the bundled directory entry. index.html
 * applies it before the app loads (scripts/vite-static-shell.mjs); the build checks it against a
 * real render of every board.
 */
export const getBoardThemeCategories = (): BoardThemeCategories => {
  const { communities } = getFallbackDirectoriesData();
  const categoryOf = (boardIdentifier: string): BoardThemeCategory => {
    const communityAddress = getCommunityAddress(boardIdentifier, communities);
    const directoryEntry = communities.find((entry) => entry.address === communityAddress);
    return deriveCommunityNsfw(undefined, directoryEntry) || getSpecialBoardByAddress(communityAddress)?.nsfw ? 'nsfw' : 'sfw';
  };

  const codes = new Set([...vendoredDirectoryLists.directories.map((list) => list.directoryCode), ...SPECIAL_BOARDS.map((board) => board.directoryCode)]);
  const addresses = new Set([
    ...vendoredDirectoryLists.directories.flatMap((list) => list.boards.map((board) => board.address)),
    ...SPECIAL_BOARDS.flatMap((board) => [board.address, ...(board.publicKey ? [board.publicKey] : []), ...(board.aliases ?? [])]),
  ]);
  return {
    codes: Object.fromEntries([...codes].map((code) => [code, categoryOf(code)])),
    addresses: Object.fromEntries([...addresses].filter((address) => !codes.has(address)).map((address) => [address, categoryOf(address)])),
  };
};
