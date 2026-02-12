import { create } from 'zustand';
import type { Comment } from '@plebbit/plebbit-react-hooks';

interface PostNumberState {
  numberToCid: Record<number, string>;
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
        if (typeof num === 'number' && cid && (nextNumberToCid[num] !== cid || nextCidToNumber[cid] !== num)) {
          if (!hasUpdates) {
            nextNumberToCid = { ...state.numberToCid };
            nextCidToNumber = { ...state.cidToNumber };
            hasUpdates = true;
          }
          nextNumberToCid[num] = cid;
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
