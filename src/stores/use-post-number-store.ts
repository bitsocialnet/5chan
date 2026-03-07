import { create } from 'zustand';
import type { Comment } from '@bitsocialhq/bitsocial-react-hooks';

interface PostNumberState {
  // Post numbers are only unique within a subplebbit, so scope by address
  // to avoid collisions in /all/ where multiple boards are shown together.
  numberToCid: Record<string, Record<number, string>>;
  cidToNumber: Record<string, number>;
  registerComments: (comments: Comment[]) => void;
}

const usePostNumberStore = create<PostNumberState>((set) => ({
  numberToCid: {},
  cidToNumber: {},
  registerComments: (comments: Comment[]) => {
    if (!comments?.length) return;

    set((state) => {
      let nextNumberToCid = state.numberToCid;
      let nextCidToNumber = state.cidToNumber;
      let hasUpdates = false;

      for (const c of comments) {
        const num = c?.number;
        const cid = c?.cid;
        const addr = c?.subplebbitAddress;
        if (typeof num !== 'number' || !cid || !addr) continue;

        const existingCid = nextNumberToCid[addr]?.[num];
        if (existingCid !== cid || nextCidToNumber[cid] !== num) {
          if (!hasUpdates) {
            nextNumberToCid = { ...state.numberToCid };
            nextCidToNumber = { ...state.cidToNumber };
            hasUpdates = true;
          }
          if (!nextNumberToCid[addr] || nextNumberToCid[addr] === state.numberToCid[addr]) {
            nextNumberToCid[addr] = { ...nextNumberToCid[addr] };
          }
          nextNumberToCid[addr][num] = cid;
          nextCidToNumber[cid] = num;
        }
      }

      if (!hasUpdates) {
        return state;
      }

      return { numberToCid: nextNumberToCid, cidToNumber: nextCidToNumber };
    });
  },
}));

export default usePostNumberStore;
