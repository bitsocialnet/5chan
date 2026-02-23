import { create } from 'zustand';

interface BoardsBarEditModalState {
  showModal: boolean;
  openBoardsBarEditModal: () => void;
  closeBoardsBarEditModal: () => void;
}

const useBoardsBarEditModalStore = create<BoardsBarEditModalState>((set) => ({
  showModal: false,

  openBoardsBarEditModal: () => {
    set({
      showModal: true,
    });
  },

  closeBoardsBarEditModal: () => {
    set({
      showModal: false,
    });
  },
}));

export default useBoardsBarEditModalStore;
