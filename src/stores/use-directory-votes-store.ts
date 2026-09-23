import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DirectoryVoteCommunity {
  name?: string;
  publicKey: string;
}

/** The standing vote one voting wallet cast in one directory contest. */
export interface StoredDirectoryVote {
  address: string;
  contestId: string;
  /** The contest topic the vote was published on; a regenerated manifest means a new topic. */
  topic: string;
  community: DirectoryVoteCommunity;
  /** `bundle.blockNumber` of the latest publish, which drives the refresh schedule. */
  blockNumber: number;
}

interface DirectoryVotesState {
  votes: Record<string, StoredDirectoryVote>;
  setVote: (vote: StoredDirectoryVote) => void;
  removeVote: (address: string, contestId: string) => void;
}

export const getDirectoryVoteKey = (address: string, contestId: string) => `${address.toLowerCase()}:${contestId}`;

const useDirectoryVotesStore = create<DirectoryVotesState>()(
  persist(
    (set) => ({
      votes: {},
      setVote: (vote) => set((state) => ({ votes: { ...state.votes, [getDirectoryVoteKey(vote.address, vote.contestId)]: vote } })),
      removeVote: (address, contestId) =>
        set((state) => {
          const key = getDirectoryVoteKey(address, contestId);
          if (!(key in state.votes)) return state;
          const { [key]: _removed, ...votes } = state.votes;
          return { votes };
        }),
    }),
    { name: 'directory-votes', partialize: (state) => ({ votes: state.votes }) },
  ),
);

export default useDirectoryVotesStore;
