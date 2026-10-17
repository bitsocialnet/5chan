import { create } from 'zustand';
import type { CatalogSortType } from '../lib/utils/catalog-sort';

/**
 * Catalog-only display order. Used by catalog view sort selector. 'active' keeps the board's own order
 * (bump order wherever the board publishes it); the others re-sort it locally.
 */
interface SortingStore {
  sortType: CatalogSortType;
  setSortType: (type: CatalogSortType) => void;
}

const useSortingStore = create<SortingStore>((set) => ({
  sortType: 'active',
  setSortType: (type) => set({ sortType: type }),
}));

export default useSortingStore;
