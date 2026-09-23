import type { ContestTally } from '@bitsocial/pubsub-voting';
import { type DirectoryListBoard, sortByDirectoryRank, sortDirectoryBoardsByRank } from './utils/directory-list-utils';

export interface RankedDirectoryVoteBoard {
  board: DirectoryListBoard;
  chainVerified?: boolean;
  nameResolved?: boolean;
  weight?: bigint;
  /** Submitted by a vote from 5chan rather than listed in the directory file. */
  nominated?: boolean;
}

const compareWeight = (first: RankedDirectoryVoteBoard, second: RankedDirectoryVoteBoard) =>
  first.weight! === second.weight! ? 0 : first.weight! > second.weight! ? -1 : 1;

/**
 * Rank a directory by its vote tally; a tally row is identified by its public key. Voted boards
 * missing from the directory file are appended as nominations, which is how boards are submitted
 * from 5chan. With `orderByVotes` false (testnet contests), listed boards keep the file's order.
 */
export const rankDirectoryBoardsByVoteTally = (
  boards: DirectoryListBoard[],
  tally: ContestTally | undefined,
  { orderByVotes = true }: { orderByVotes?: boolean } = {},
): RankedDirectoryVoteBoard[] => {
  if (!tally) return sortDirectoryBoardsByRank(boards).map((board) => ({ board }));

  // Live ties ignore the file's manual scores; without vote ordering the file's full ranking applies.
  const fallbackOrder = orderByVotes
    ? sortByDirectoryRank(boards, (board) => ({ id: board.address, owner: board.owner, addedAt: board.addedAt }))
    : sortDirectoryBoardsByRank(boards);
  const fallbackIndex = new Map(fallbackOrder.map((board, index) => [board, index]));
  const tallyByPublicKey = new Map(tally.ranking.map((row) => [row.community.publicKey, row]));
  // A board listed without a public key can only be matched by its name; the tally already drops
  // rows whose name resolves to a different key.
  const tallyByName = new Map(tally.ranking.filter((row) => row.community.name && row.nameResolved !== false).map((row) => [row.community.name!, row]));
  const findRow = (board: DirectoryListBoard) => (board.publicKey ? tallyByPublicKey.get(board.publicKey) : tallyByName.get(board.address));
  const listedRows = new Set(boards.map(findRow).filter(Boolean));

  const listed = boards
    .map<RankedDirectoryVoteBoard>((board) => {
      const row = findRow(board);
      return row ? { board, weight: row.weight, chainVerified: row.chainVerified, nameResolved: row.nameResolved } : { board, weight: BigInt(0), chainVerified: true };
    })
    .sort((first, second) => (orderByVotes && compareWeight(first, second)) || fallbackIndex.get(first.board)! - fallbackIndex.get(second.board)!);

  // The tally already dropped votes whose name resolves to another key; hide the rest until resolved.
  const nominated = tally.ranking
    .filter((row) => !listedRows.has(row) && row.weight > BigInt(0) && row.nameResolved !== false)
    .map<RankedDirectoryVoteBoard>((row) => ({
      board: { address: row.community.name ?? row.community.publicKey, publicKey: row.community.publicKey },
      weight: row.weight,
      chainVerified: row.chainVerified,
      nameResolved: row.nameResolved,
      nominated: true,
    }));

  if (!orderByVotes) return [...listed, ...nominated];
  return [...listed, ...nominated].sort((first, second) => compareWeight(first, second) || Number(!!first.nominated) - Number(!!second.nominated));
};
