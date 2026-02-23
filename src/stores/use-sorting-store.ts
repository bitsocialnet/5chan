import { create } from 'zustand';

/** Catalog-only sort state. Used by catalog view sort selector. */
export type CatalogSortType = 'active' | 'new' | 'replyCount';

interface SortingStore {
  sortType: CatalogSortType;
  setSortType: (type: CatalogSortType) => void;
}

const useSortingStore = create<SortingStore>((set) => ({
  sortType: 'active',
  setSortType: (type) => set({ sortType: type }),
}));

export default useSortingStore;
