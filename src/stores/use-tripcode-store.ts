import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TripcodeState {
  /**
   * The tripcode part of each account's name field (`#password`, `##password`), as typed. Kept on this
   * device only and apart from `account.author`, which the account attaches to everything it publishes.
   */
  inputs: Record<string, string>;
  setTripcodeInput: (accountId: string, tripcodeInput: string | undefined) => void;
}

const useTripcodeStore = create<TripcodeState>()(
  persist(
    (set) => ({
      inputs: {},
      setTripcodeInput: (accountId, tripcodeInput) =>
        set((state) => {
          if ((state.inputs[accountId] ?? undefined) === tripcodeInput) return state;
          const inputs = { ...state.inputs };
          if (tripcodeInput) inputs[accountId] = tripcodeInput;
          else delete inputs[accountId];
          return { inputs };
        }),
    }),
    {
      name: 'tripcode-inputs',
    },
  ),
);

export default useTripcodeStore;
