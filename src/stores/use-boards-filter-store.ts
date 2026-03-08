import { create } from 'zustand';

type BoardFilter = 'all' | 'nsfw' | 'worksafe';

interface BoardsFilterStore {
  useCatalogLinks: boolean;
  setUseCatalogLinks: (value: boolean) => void;
  boardFilter: BoardFilter;
  setBoardFilter: (value: BoardFilter) => void;
}

const getStoredUseCatalogLinks = (): boolean => {
  try {
    const stored = localStorage.getItem('5chan-boards-use-catalog');
    return stored === 'true';
  } catch {
    return false;
  }
};

const getStoredBoardFilter = (): BoardFilter => {
  try {
    const stored = localStorage.getItem('5chan-boards-filter') as BoardFilter;
    return stored === 'nsfw' || stored === 'worksafe' ? stored : 'all';
  } catch {
    return 'all';
  }
};

const useBoardsFilterStore = create<BoardsFilterStore>((set) => ({
  useCatalogLinks: getStoredUseCatalogLinks(),
  setUseCatalogLinks: (value: boolean) => {
    set({ useCatalogLinks: value });
    try {
      localStorage.setItem('5chan-boards-use-catalog', value.toString());
    } catch (error) {
      console.warn('Failed to save useCatalogLinks to localStorage:', error);
    }
  },
  boardFilter: getStoredBoardFilter(),
  setBoardFilter: (value: BoardFilter) => {
    set({ boardFilter: value });
    try {
      localStorage.setItem('5chan-boards-filter', value);
    } catch (error) {
      console.warn('Failed to save boardFilter to localStorage:', error);
    }
  },
}));

export default useBoardsFilterStore;
