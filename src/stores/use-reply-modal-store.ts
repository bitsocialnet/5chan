import { create } from 'zustand';
import useSelectedTextStore from './use-selected-text-store';

interface ReplyModalState {
  showReplyModal: boolean;
  activeCid: string | null;
  parentNumber: number | null;
  threadNumber: number | null;
  threadCid: string | null;
  subplebbitAddress: string | null;
  scrollY: number;
  quoteInsertRequestId: number;
  quoteInsertNumber: number | null;
  quoteInsertSelectedText: string | null;
  closeModal: () => void;
  openReplyModal: (parentCid: string, parentNumber: number | undefined, postCid: string, threadNumber: number | undefined, subplebbitAddress: string) => void;
}

const getQuotedSelection = () => {
  const text = document.getSelection()?.toString();
  if (!text) return '';

  // Keep each selected line as 5chan greentext and normalize newlines.
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\n+$/g, '');

  if (!normalizedText) return '';

  return normalizedText
    .split('\n')
    .map((line) => `>${line}`)
    .join('\n');
};

const useReplyModalStore = create<ReplyModalState>((set, get) => ({
  showReplyModal: false,
  activeCid: null,
  parentNumber: null,
  threadNumber: null,
  threadCid: null,
  subplebbitAddress: null,
  scrollY: 0,
  quoteInsertRequestId: 0,
  quoteInsertNumber: null,
  quoteInsertSelectedText: null,

  closeModal: () => {
    // Reset selected text if you're using that store
    useSelectedTextStore.getState().resetSelectedText();
    set({
      showReplyModal: false,
      activeCid: null,
      parentNumber: null,
      threadNumber: null,
      quoteInsertNumber: null,
      quoteInsertSelectedText: null,
    });
  },

  openReplyModal: (parentCid, parentNumber, postCid, threadNumber, subplebbitAddress) => {
    const quotedSelection = getQuotedSelection();

    // If the reply modal is already open, insert this quote in the current textarea at caret.
    if (get().showReplyModal) {
      set((state) => ({
        quoteInsertRequestId: state.quoteInsertRequestId + 1,
        quoteInsertNumber: parentNumber ?? null,
        quoteInsertSelectedText: quotedSelection || null,
      }));
      return;
    }

    if (quotedSelection) {
      useSelectedTextStore.getState().setSelectedText(`${quotedSelection}\n`);
    }

    // Handle mobile scrollY
    const isMobile = window.innerWidth <= 768; // Simple check, adjust as needed
    const scrollY = isMobile ? window.scrollY : 0;

    set({
      activeCid: postCid,
      parentNumber: parentNumber ?? null,
      threadNumber: threadNumber ?? null,
      threadCid: postCid,
      showReplyModal: true,
      subplebbitAddress,
      scrollY,
    });
  },
}));

export default useReplyModalStore;
