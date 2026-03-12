import { create } from 'zustand';

interface ExternalQuoteStatusState {
  message: string | null;
  clearStatus: () => void;
  setErrorStatus: (message: string) => void;
}

let hideTimeout: number | null = null;

const clearHideTimeout = () => {
  if (hideTimeout !== null) {
    window.clearTimeout(hideTimeout);
    hideTimeout = null;
  }
};

const scheduleHide = (clearStatus: () => void, delayMs: number) => {
  clearHideTimeout();
  hideTimeout = window.setTimeout(() => {
    clearStatus();
  }, delayMs);
};

const useExternalQuoteStatusStore = create<ExternalQuoteStatusState>((set, get) => ({
  message: null,
  clearStatus: () => {
    clearHideTimeout();
    set({ message: null });
  },
  setErrorStatus: (message: string) => {
    set({ message });
    scheduleHide(get().clearStatus, 4000);
  },
}));

export default useExternalQuoteStatusStore;
