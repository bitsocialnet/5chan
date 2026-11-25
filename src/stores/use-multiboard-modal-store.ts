import { create } from 'zustand';

export type MultiboardModal =
  // A new multiboard (starting from `boards`, or from the multiboard being read) or the saved one with `multiboardId`.
  | { kind: 'editor'; multiboardId?: string; boards?: string[] }
  // The saved multiboards a board can be added to: `board` is its code or address, `boardLabel` how to show it, and
  // `aliases` the board's other identifiers (its address when it is opened by code), which a multiboard may hold instead.
  | { kind: 'add'; board: string; boardLabel: string; aliases: string[] };

interface MultiboardModalState {
  modal: MultiboardModal | null;
  openMultiboardEditor: (options?: { multiboardId?: string; boards?: string[] }) => void;
  openAddToMultiboard: (board: string, boardLabel: string, aliases?: string[]) => void;
  closeMultiboardModal: () => void;
}

const useMultiboardModalStore = create<MultiboardModalState>((set) => ({
  modal: null,
  openMultiboardEditor: (options) => set({ modal: { kind: 'editor', ...options } }),
  openAddToMultiboard: (board, boardLabel, aliases = []) => set({ modal: { kind: 'add', board, boardLabel, aliases } }),
  closeMultiboardModal: () => set({ modal: null }),
}));

export default useMultiboardModalStore;
