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
  /** The board voted for; undefined while a withdrawal still has to be re-signed. */
  community?: DirectoryVoteCommunity;
  /** `bundle.blockNumber` of the latest publish, which drives the refresh schedule. */
  blockNumber: number;
  /**
   * Set when this ballot replaced another in the same bucket. Equal block numbers resolve by the
   * lowest CID, not publish order, so the choice is re-signed once the next bucket starts.
   */
  resignNextBucket?: boolean;
  /**
   * When a background refresh last re-signed this vote (ms). The next refresh needs a visit to the
   * directory after it (lib/directory-vote-visits); a vote the user just cast or changed has none.
   */
  refreshedAt?: number;
}

interface DirectoryVotesState {
  votes: Record<string, StoredDirectoryVote>;
  setVote: (vote: StoredDirectoryVote) => void;
  removeVote: (address: string, contestId: string) => void;
}

export const getDirectoryVoteKey = (address: string, contestId: string) => `${address.toLowerCase()}:${contestId}`;

const STORAGE_NAME = 'directory-votes';

// Keeps this tab's object for each vote whose stored copy is unchanged, so a refresh that captured
// the vote still recognizes it after another tab saves an unrelated change (see refreshDueDirectoryVotes).
const mergeStoredVotes = (persisted: unknown, current: DirectoryVotesState): DirectoryVotesState => {
  const stored = (persisted as Partial<DirectoryVotesState> | undefined)?.votes;
  if (!stored) return current;
  const votes = Object.fromEntries(
    Object.entries(stored).map(([key, vote]) => {
      const kept = current.votes[key];
      return [key, kept && JSON.stringify(kept) === JSON.stringify(vote) ? kept : vote];
    }),
  );
  return { ...current, votes };
};

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
    { name: STORAGE_NAME, partialize: (state) => ({ votes: state.votes }), merge: mergeStoredVotes },
  ),
);

// Every write persists the whole map, so a tab that missed another tab's vote, or a background
// refresh in it, would erase that vote from storage. Reload the map whenever another tab saves it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_NAME) void useDirectoryVotesStore.persist.rehydrate();
  });
}

export default useDirectoryVotesStore;
