import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Comment } from '@bitsocialhq/bitsocial-react-hooks';
import { commentMatchesPattern } from '../lib/utils/pattern-utils';

interface FilterItem {
  text: string;
  enabled: boolean;
  count: number;
  filteredCids: Set<string>;
  subplebbitCounts: Map<string, number>;
  subplebbitFilteredCids: Map<string, Set<string>>;
  hide: boolean;
  top: boolean;
  color?: string;
}

interface CatalogFiltersStore {
  filterText: string;
  setFilterText: (value: string) => void;
  filterItems: FilterItem[];
  setFilterItems: (items: FilterItem[]) => void;
  saveAndApplyFilters: (items: FilterItem[]) => void;
  filter: ((comment: Comment) => boolean) | undefined;
  updateFilter: () => void;
  initializeFilter: () => void;
  filteredCount: number;
  filteredCids: Set<string>;
  incrementFilterCount: (filterIndex: number, cid: string, subplebbitAddress: string) => void;
  recalcFilteredCount: () => void;
  currentSubplebbitAddress: string | null;
  setCurrentSubplebbitAddress: (address: string | null) => void;
  getFilteredCountForCurrentSubplebbit: () => number;
  searchText: string;
  setSearchFilter: (text: string) => void;
  clearSearchFilter: () => void;
  resetCountsForCurrentSubplebbit: () => void;
  matchedFilters: Map<string, string>;
  setMatchedFilter: (cid: string, color: string) => void;
  clearMatchedFilters: () => void;
}

const useCatalogFiltersStore = create(
  persist<CatalogFiltersStore>(
    (set, get) => ({
      filterText: '',
      setFilterText: (value: string) => set({ filterText: value }),
      filterItems: [],
      filteredCount: 0,
      filteredCids: new Set<string>(),
      currentSubplebbitAddress: null,
      matchedFilters: new Map<string, string>(),
      setMatchedFilter: (cid: string, color: string) => {
        set((state) => {
          const newMatchedFilters = new Map(state.matchedFilters);
          if (color) {
            newMatchedFilters.set(cid, color);
          } else {
            newMatchedFilters.delete(cid);
          }
          return { matchedFilters: newMatchedFilters };
        });
      },
      clearMatchedFilters: () => {
        set({ matchedFilters: new Map<string, string>() });
      },
      setCurrentSubplebbitAddress: (address: string | null) => {
        const prevAddress = get().currentSubplebbitAddress;

        if (address !== prevAddress) {
          set((state) => {
            if (address) {
              const updatedFilterItems = state.filterItems.map((item) => {
                const newItem = { ...item };

                // Reset count and filteredCids (global counters)
                newItem.count = 0;
                newItem.filteredCids = new Set();

                // Ensure subplebbitCounts is a Map
                if (!newItem.subplebbitCounts || !(newItem.subplebbitCounts instanceof Map)) {
                  newItem.subplebbitCounts = new Map();
                }

                // Ensure subplebbitFilteredCids is a Map
                if (!newItem.subplebbitFilteredCids || !(newItem.subplebbitFilteredCids instanceof Map)) {
                  newItem.subplebbitFilteredCids = new Map();
                }

                // Only initialize for the new address if it doesn't already exist
                if (!newItem.subplebbitFilteredCids.has(address)) {
                  newItem.subplebbitFilteredCids.set(address, new Set<string>());
                }
                if (!newItem.subplebbitCounts.has(address)) {
                  newItem.subplebbitCounts.set(address, 0);
                }

                return newItem;
              });

              return {
                currentSubplebbitAddress: address,
                filterItems: updatedFilterItems,
                filteredCount: 0, // This will be recalculated below
              };
            }

            return { currentSubplebbitAddress: address };
          });

          // Recalculate the filtered count for the current subplebbit
          get().recalcFilteredCount();
          get().updateFilter();
        } else {
          set({ currentSubplebbitAddress: address });
        }
      },
      searchText: '',
      setSearchFilter: (text: string) => {
        set({ searchText: text });
        get().updateFilter();
      },
      clearSearchFilter: () => {
        set({ searchText: '' });
        get().updateFilter();
      },
      setFilterItems: (items: FilterItem[]) => {
        const nonEmptyItems = items
          .filter((item) => item.text.trim() !== '')
          .map((item) => ({
            ...item,
            count: item.count || 0,
            filteredCids: item.filteredCids || new Set(),
            subplebbitCounts: item.subplebbitCounts || new Map(),
            subplebbitFilteredCids: item.subplebbitFilteredCids || new Map(),
            hide: item.hide ?? true,
            top: item.top ?? false,
            color: item.color || '',
          }));
        set({ filterItems: nonEmptyItems });
        get().recalcFilteredCount();
      },
      saveAndApplyFilters: (items: FilterItem[]) => {
        const nonEmptyItems = items
          .filter((item) => item.text.trim() !== '')
          .map((item) => ({
            ...item,
            count: item.count || 0,
            filteredCids: item.filteredCids || new Set(),
            subplebbitCounts: item.subplebbitCounts || new Map(),
            subplebbitFilteredCids: item.subplebbitFilteredCids || new Map(),
            hide: item.hide ?? true,
            top: item.top ?? false,
            color: item.color || '',
          }));

        // Compare new filter items with existing ones to detect pattern changes
        const existingItems = get().filterItems;
        const updatedItems = nonEmptyItems.map((newItem) => {
          // Try to find matching existing item by index or text
          const existingItem = existingItems.find((item) => item.text === newItem.text);

          // If we found a matching item, keep its counts
          if (existingItem) {
            return {
              ...newItem,
              count: existingItem.count,
              filteredCids: existingItem.filteredCids,
              subplebbitCounts: existingItem.subplebbitCounts,
              subplebbitFilteredCids: existingItem.subplebbitFilteredCids,
              color: newItem.color || '',
            };
          }

          // If pattern has changed or it's a new filter, reset all counts
          return {
            ...newItem,
            count: 0,
            filteredCids: new Set<string>(),
            subplebbitCounts: new Map<string, number>(),
            subplebbitFilteredCids: new Map<string, Set<string>>(),
            color: newItem.color || '',
          };
        });

        // Clear matched filters when saving new filters
        get().clearMatchedFilters();

        set({
          filterItems: updatedItems,
          filteredCids: new Set<string>(),
        });

        get().recalcFilteredCount();
        get().updateFilter();
      },
      filter: undefined,
      updateFilter: () => {
        set((state) => ({
          filter: (comment: Comment) => {
            if (!comment?.cid) return true;

            const currentSubplebbit = state.currentSubplebbitAddress;

            // Apply search filter
            if (state.searchText.trim() !== '') {
              if (!commentMatchesPattern(comment, state.searchText)) {
                return false;
              }
            }

            // Apply content filters
            const { filterItems } = state;
            let shouldHide = false;

            for (let i = 0; i < filterItems.length; i++) {
              const item = filterItems[i];
              if (item.enabled && item.text.trim() !== '') {
                if (commentMatchesPattern(comment, item.text)) {
                  // If we have a current subplebbit and this is a match, increment the count
                  if (currentSubplebbit && comment.subplebbitAddress === currentSubplebbit) {
                    // We need to use a timeout to avoid modifying state during a state update
                    setTimeout(() => {
                      const filterIndex = filterItems.findIndex((f) => f.text === item.text && f.enabled);
                      if (filterIndex !== -1) {
                        get().incrementFilterCount(filterIndex, comment.cid, comment.subplebbitAddress);
                      }
                    }, 0);
                  }

                  if (item.hide) {
                    shouldHide = true;
                  }
                }
              }
            }

            return !shouldHide;
          },
        }));
      },
      initializeFilter: () => {
        get().updateFilter();
      },
      incrementFilterCount: (filterIndex: number, cid: string, subplebbitAddress: string) => {
        set((state) => {
          const newFilterItems = [...state.filterItems];
          if (newFilterItems[filterIndex]) {
            const item = newFilterItems[filterIndex];

            // Ensure subplebbitFilteredCids is a Map
            const subplebbitFilteredCids = new Map(item.subplebbitFilteredCids);
            if (!subplebbitFilteredCids.has(subplebbitAddress)) {
              subplebbitFilteredCids.set(subplebbitAddress, new Set());
            }
            const cidSet = subplebbitFilteredCids.get(subplebbitAddress)!;

            // Only increment the count if this CID hasn't been counted for this subplebbit yet
            if (!cidSet.has(cid)) {
              const newItemFilteredCids = new Set(item.filteredCids);
              newItemFilteredCids.add(cid);

              cidSet.add(cid);
              subplebbitFilteredCids.set(subplebbitAddress, cidSet);

              const subplebbitCounts = new Map(item.subplebbitCounts);
              const currentCount = subplebbitCounts.get(subplebbitAddress) || 0;
              subplebbitCounts.set(subplebbitAddress, currentCount + 1);

              newFilterItems[filterIndex] = {
                ...item,
                count: item.count + 1,
                filteredCids: newItemFilteredCids,
                subplebbitCounts,
                subplebbitFilteredCids,
              };

              return { filterItems: newFilterItems };
            }
          }
          return state;
        });

        get().recalcFilteredCount();
      },
      recalcFilteredCount: () => {
        set((state) => {
          const currentSubplebbit = state.currentSubplebbitAddress;
          if (!currentSubplebbit) return { filteredCount: 0 };

          let filteredCount = 0;
          for (const item of state.filterItems) {
            if (item.enabled && item.hide) {
              const subCount = item.subplebbitCounts?.get(currentSubplebbit) || 0;
              filteredCount += subCount;
            }
          }

          return { filteredCount };
        });
      },
      getFilteredCountForCurrentSubplebbit: () => {
        const state = get();
        const currentSubplebbit = state.currentSubplebbitAddress;
        if (!currentSubplebbit) return 0;

        let filteredCount = 0;
        for (const item of state.filterItems) {
          if (item.enabled && item.hide) {
            const subCount = item.subplebbitCounts?.get(currentSubplebbit) || 0;
            filteredCount += subCount;
          }
        }

        return filteredCount;
      },
      resetCountsForCurrentSubplebbit: () => {
        const currentSubplebbit = get().currentSubplebbitAddress;
        if (!currentSubplebbit) return;

        set((state) => {
          const updatedFilterItems = state.filterItems.map((item) => {
            const newItem = { ...item };

            // Ensure maps are properly initialized
            if (!newItem.subplebbitCounts || !(newItem.subplebbitCounts instanceof Map)) {
              newItem.subplebbitCounts = new Map();
            }
            if (!newItem.subplebbitFilteredCids || !(newItem.subplebbitFilteredCids instanceof Map)) {
              newItem.subplebbitFilteredCids = new Map();
            }

            // Reset counts for current subplebbit
            newItem.subplebbitCounts.set(currentSubplebbit, 0);
            newItem.subplebbitFilteredCids.set(currentSubplebbit, new Set<string>());

            return newItem;
          });

          return {
            filterItems: updatedFilterItems,
            filteredCount: 0,
          };
        });

        // Trigger filter reapplication to start counting again
        get().updateFilter();
      },
    }),
    {
      name: 'catalog-filters-storage',
      partialize: (state) => {
        return {
          filterItems: state.filterItems.map((item) => ({
            text: item.text,
            enabled: item.enabled,
            hide: item.hide,
            top: item.top,
          })),
        } as any;
      },
      deserialize: (persisted) => {
        const persistedObj = typeof persisted === 'string' ? JSON.parse(persisted) : persisted;

        if (persistedObj && persistedObj.filterItems) {
          return {
            ...persistedObj,
            filterItems: persistedObj.filterItems.map((item: any) => ({
              text: item.text,
              enabled: item.enabled,
              hide: item.hide,
              top: item.top,
              count: 0,
              filteredCids: new Set<string>(),
              subplebbitCounts: new Map<string, number>(),
              subplebbitFilteredCids: new Map<string, Set<string>>(),
            })),
            filteredCount: 0,
          };
        }
        return persistedObj || persisted;
      },
    },
  ),
);

useCatalogFiltersStore.getState().updateFilter();

export default useCatalogFiltersStore;
