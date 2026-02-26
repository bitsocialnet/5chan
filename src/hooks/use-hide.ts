import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import localForageLru from '@plebbit/plebbit-react-hooks/dist/lib/localforage-lru/index.js';

interface HideStoreState {
  hiddenCids: { [key: string]: boolean };
  hide: (cid: string) => void;
  unhide: (cid: string) => void;
}

const hideStore = localForageLru.createInstance({
  name: 'hideStore',
  size: 1000,
});

const useHideStore = create<HideStoreState>((set) => ({
  hiddenCids: {},
  hide: (cid: string) => {
    set((state) => ({
      hiddenCids: { ...state.hiddenCids, [cid]: true },
    }));
    hideStore.setItem(cid, true);
  },
  unhide: (cid: string) => {
    set((state) => {
      const newHiddenCids = { ...state.hiddenCids };
      delete newHiddenCids[cid];
      return { hiddenCids: newHiddenCids };
    });
    hideStore.removeItem(cid);
  },
}));

const initializeHideStore = async () => {
  const entries: [string, boolean][] = await hideStore.entries();
  const hiddenCids: { [key: string]: boolean } = {};
  entries.forEach(([key, value]) => {
    hiddenCids[key] = value;
  });

  useHideStore.setState((state) => ({
    hiddenCids: { ...hiddenCids, ...state.hiddenCids },
  }));
};

initializeHideStore();

const useHide = ({ cid }: { cid: string }) => {
  const hidden = useHideStore((state) => !!state.hiddenCids[cid]);
  const hide = useHideStore((state) => state.hide);
  const unhide = useHideStore((state) => state.unhide);

  const hideCallback = useCallback(() => hide(cid), [hide, cid]);
  const unhideCallback = useCallback(() => unhide(cid), [unhide, cid]);

  return useMemo(() => ({ hidden, hide: hideCallback, unhide: unhideCallback }), [hidden, hideCallback, unhideCallback]);
};

export default useHide;
