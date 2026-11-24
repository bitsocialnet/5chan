import { create } from 'zustand';

export type MultiboardModal =
  // A new multiboard (starting from `boards`, or from the multiboard being read) or the saved one with `multiboardId`.
  | { kind: 'editor'; multiboardId?: string; boards?: string[] }
  // The saved multiboards a board can be added to: `board` is its code or address, `boardLabel` how to show it.
  | { kind: 'add'; board: string; boardLabel: string };

interface MultiboardModalState {
  modal: MultiboardModal | null;
  openMultiboardEditor: (options?: { multiboardId?: string; boards?: string[] }) => void;
  openAddToMultiboard: (board: string, boardLabel: string) => void;
  closeMultiboardModal: () => void;
}

const useMultiboardModalStore = create<MultiboardModalState>((set) => ({
  modal: null,
  openMultiboardEditor: (options) => set({ modal: { kind: 'editor', ...options } }),
  openAddToMultiboard: (board, boardLabel) => set({ modal: { kind: 'add', board, boardLabel } }),
  closeMultiboardModal: () => set({ modal: null }),
}));

export default useMultiboardModalStore;
