import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PersistentBoardsBarState {
  persistentBoardsBar: boolean;
  traditionalBoardList: boolean;
  autoHideBoardsBar: boolean;
  setPersistentBoardsBar: (persistent: boolean) => void;
  setTraditionalBoardList: (traditional: boolean) => void;
  setAutoHideBoardsBar: (autoHide: boolean) => void;
}

const usePersistentBoardsBarStore = create<PersistentBoardsBarState>()(
  persist(
    (set) => ({
      persistentBoardsBar: false,
      // Off by default like 4chan, which pins a board select unless the traditional list is chosen.
      traditionalBoardList: false,
      autoHideBoardsBar: false,
      setPersistentBoardsBar: (persistent) => set({ persistentBoardsBar: persistent }),
      setTraditionalBoardList: (traditional) => set({ traditionalBoardList: traditional }),
      setAutoHideBoardsBar: (autoHide) => set({ autoHideBoardsBar: autoHide }),
    }),
    {
      name: 'persistent-boards-bar-store',
    },
  ),
);

export default usePersistentBoardsBarStore;
