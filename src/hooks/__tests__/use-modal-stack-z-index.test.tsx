import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useModalStackStore from '../../stores/use-modal-stack-store';
import useModalStackZIndex, { MODAL_STACK_BASE_Z_INDEX } from '../use-modal-stack-z-index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

// Stands in for the reply modal (mounted while hidden, shown by isOpen) and a challenge (mounted only while shown).
const Modal = ({ name, isOpen = true }: { name: string; isOpen?: boolean }) => {
  const zIndex = useModalStackZIndex(isOpen);
  return isOpen ? <div data-modal={name} style={{ zIndex }} /> : null;
};

const Page = ({ replyOpen, challengeOpen }: { replyOpen: boolean; challengeOpen: boolean }) => (
  <>
    {/* The page renders the challenge before the reply modal, so their order in the page cannot decide the stacking. */}
    {challengeOpen && <Modal name='challenge' />}
    <Modal name='reply' isOpen={replyOpen} />
  </>
);

let container: HTMLDivElement;
let root: Root;

const renderPage = async (props: { replyOpen: boolean; challengeOpen: boolean }) => {
  await act(async () => {
    root.render(<Page {...props} />);
  });
};

const getZIndex = (name: string) => Number((container.querySelector(`[data-modal="${name}"]`) as HTMLElement | null)?.style.zIndex);

describe('useModalStackZIndex', () => {
  beforeEach(() => {
    useModalStackStore.setState({ openModalIds: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('puts a challenge that appears over the open reply modal on top', async () => {
    await renderPage({ replyOpen: true, challengeOpen: false });
    expect(getZIndex('reply')).toBe(MODAL_STACK_BASE_Z_INDEX);

    await renderPage({ replyOpen: true, challengeOpen: true });
    expect(getZIndex('challenge')).toBeGreaterThan(getZIndex('reply'));
  });

  it('puts a reply modal opened while a challenge is showing on top', async () => {
    await renderPage({ replyOpen: false, challengeOpen: true });
    await renderPage({ replyOpen: true, challengeOpen: true });

    expect(getZIndex('reply')).toBeGreaterThan(getZIndex('challenge'));
  });

  it('keeps the layers bounded as modals open and close', async () => {
    await renderPage({ replyOpen: true, challengeOpen: false });
    for (let i = 0; i < 5; i++) {
      await renderPage({ replyOpen: true, challengeOpen: true });
      await renderPage({ replyOpen: true, challengeOpen: false });
      await renderPage({ replyOpen: false, challengeOpen: false });
      await renderPage({ replyOpen: true, challengeOpen: false });
    }
    await renderPage({ replyOpen: true, challengeOpen: true });

    expect(getZIndex('reply')).toBe(MODAL_STACK_BASE_Z_INDEX);
    expect(getZIndex('challenge')).toBe(MODAL_STACK_BASE_Z_INDEX + 1);
  });
});
