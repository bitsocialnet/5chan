import { create } from 'zustand';
import type { SearchSummaryPublisher, SearchSummaryStatus } from '../lib/search-indexer';
import { DEFAULT_SEARCH_POST_STATUS, type SearchPostStatus } from '../lib/search-navigation';

export type { SearchSummaryStatus };

interface SearchSummaryState {
  /** Indexer that answered, which the header credits instead of the ranked-first one. */
  providerId: string | null;
  /** Query the totals belong to, so a stale count is never shown for a new search. */
  query: string;
  postStatus: SearchPostStatus;
  status: SearchSummaryStatus;
  total: number | null;
  setSummary: SearchSummaryPublisher;
}

/** Published by the search request so the board header can title the page with it. */
const useSearchSummaryStore = create<SearchSummaryState>((set) => ({
  providerId: null,
  query: '',
  postStatus: DEFAULT_SEARCH_POST_STATUS,
  status: 'pending',
  total: null,
  setSummary: (query, postStatus, status, total = null, providerId = null) =>
    set((state) =>
      state.query === query && state.postStatus === postStatus && state.status === status && state.total === total && state.providerId === providerId
        ? state
        : { query, postStatus, status, total, providerId },
    ),
}));

/** Handed to getIndexerSearch so the request publishes into this store without lib importing it. */
export const publishSearchSummary: SearchSummaryPublisher = (query, postStatus, status, total, providerId) =>
  useSearchSummaryStore.getState().setSummary(query, postStatus, status, total, providerId);

export default useSearchSummaryStore;
