const THREAD_SCROLL_SPACER_ID = 'thread-scroll-spacer';

const setThreadScrollSpacerHeight = (height: number) => {
  const existingSpacer = document.getElementById(THREAD_SCROLL_SPACER_ID);
  if (height <= 0) {
    existingSpacer?.remove();
    return;
  }

  const spacer =
    existingSpacer ||
    Object.assign(document.createElement('div'), {
      id: THREAD_SCROLL_SPACER_ID,
    });

  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.height = `${Math.ceil(height)}px`;
  spacer.style.pointerEvents = 'none';
  spacer.style.opacity = '0';

  if (!existingSpacer) {
    document.body.appendChild(spacer);
  }
};

export const clearThreadScrollSpacer = () => {
  document.getElementById(THREAD_SCROLL_SPACER_ID)?.remove();
};

export const scrollThreadContainerToTop = (cid?: string) => {
  if (!cid) return false;

  const threadContainer = document.querySelector<HTMLElement>(`[data-thread-container-cid="${cid}"]`);
  if (!threadContainer) return false;

  const desiredTop = window.scrollY + threadContainer.getBoundingClientRect().top;
  const maxScrollTop = document.documentElement.scrollHeight - window.innerHeight;
  const extraSpace = Math.max(0, desiredTop - maxScrollTop);

  setThreadScrollSpacerHeight(extraSpace);
  window.scrollTo({
    top: desiredTop,
    left: 0,
    behavior: 'auto',
  });

  return true;
};
