import { create } from 'zustand';

interface ModalStackState {
  // Ids of the open stacked modals, in the order they appeared.
  openModalIds: string[];
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
}

const useModalStackStore = create<ModalStackState>((set) => ({
  openModalIds: [],
  openModal: (id) => set((state) => ({ openModalIds: [...state.openModalIds.filter((openId) => openId !== id), id] })),
  closeModal: (id) => set((state) => ({ openModalIds: state.openModalIds.filter((openId) => openId !== id) })),
}));

export default useModalStackStore;
