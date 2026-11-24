import { create } from 'zustand';

interface CustomMultiboardModalState {
  showModal: boolean;
  openCustomMultiboardModal: () => void;
  closeCustomMultiboardModal: () => void;
}

const useCustomMultiboardModalStore = create<CustomMultiboardModalState>((set) => ({
  showModal: false,
  openCustomMultiboardModal: () => set({ showModal: true }),
  closeCustomMultiboardModal: () => set({ showModal: false }),
}));

export default useCustomMultiboardModalStore;
