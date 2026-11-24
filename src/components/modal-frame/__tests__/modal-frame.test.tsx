import * as React from 'react';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ModalFrame from '../modal-frame';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const Harness = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type='button' onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <ModalFrame title='Title' titleId='frame-title' closeLabel='Close frame' onClose={() => setOpen(false)}>
          <input aria-label='First field' />
          <button type='button'>Last</button>
        </ModalFrame>
      )}
    </>
  );
};

const pressKey = (target: Element, key: string, shiftKey = false) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  });

describe('ModalFrame', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const open = () => {
    const opener = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open')!;
    opener.focus();
    act(() => opener.click());
    return opener;
  };

  it('takes focus on open and gives it back to the opener on close', () => {
    const opener = open();
    expect(document.activeElement).toBe(container.querySelector('dialog'));

    pressKey(container.querySelector('dialog')!, 'Escape');

    expect(container.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the dialog, and leaves the backdrop out of the tab order', () => {
    open();
    const dialog = container.querySelector('dialog')!;
    const closeIcon = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    const last = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Last')!;

    expect(container.querySelector('button[aria-label="Close frame"]')?.getAttribute('tabindex')).toBe('-1');

    pressKey(dialog, 'Tab', true);
    expect(document.activeElement).toBe(last);

    pressKey(last, 'Tab');
    expect(document.activeElement).toBe(closeIcon);

    pressKey(closeIcon, 'Tab', true);
    expect(document.activeElement).toBe(last);
  });
});
