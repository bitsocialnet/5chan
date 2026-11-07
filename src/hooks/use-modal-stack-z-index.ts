import { useId, useLayoutEffect } from 'react';
import useModalStackStore from '../stores/use-modal-stack-store';

// A lone stacked modal's layer: the page's other modals' layer, above the post transfer modal (998),
// whose publishes can open a challenge.
export const MODAL_STACK_BASE_Z_INDEX = 999;

/**
 * Returns the z-index for a modal that can open while another one is showing (the reply modal, its
 * TeX preview and a challenge, such as a reply's spam blocker check): each modal covers every
 * stacked modal that appeared before it. The order cannot come from the page, where a challenge
 * renders before the reply modal, and phones cannot drag a modal out of the way.
 */
const useModalStackZIndex = (isOpen = true) => {
  const id = useId();
  const position = useModalStackStore((state) => state.openModalIds.indexOf(id));

  // A layout effect, so a modal that just appeared takes its layer before it is first painted.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const { openModal, closeModal } = useModalStackStore.getState();
    openModal(id);
    return () => closeModal(id);
  }, [id, isOpen]);

  return MODAL_STACK_BASE_Z_INDEX + Math.max(position, 0);
};

export default useModalStackZIndex;
