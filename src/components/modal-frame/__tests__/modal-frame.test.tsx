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
    // The app's root, which the frame makes inert while it is open.
    container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const open = () => {
    const opener = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Open')!;
    opener.focus();
    act(() => opener.click());
    return opener;
  };

  it('renders outside the app root, makes the root inert while open, and gives focus back on close', () => {
    const opener = open();
    const dialog = document.querySelector('dialog')!;
    expect(document.activeElement).toBe(dialog);
    expect(container.contains(dialog)).toBe(false);
    expect(container.hasAttribute('inert')).toBe(true);

    pressKey(dialog, 'Escape');

    expect(document.querySelector('dialog')).toBeNull();
    expect(container.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the dialog, and leaves the backdrop out of the tab order', () => {
    open();
    const dialog = document.querySelector('dialog')!;
    const closeIcon = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    const last = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Last')!;

    expect(document.querySelector('button[aria-label="Close frame"]')?.getAttribute('tabindex')).toBe('-1');

    pressKey(dialog, 'Tab', true);
    expect(document.activeElement).toBe(last);

    pressKey(last, 'Tab');
    expect(document.activeElement).toBe(closeIcon);

    pressKey(closeIcon, 'Tab', true);
    expect(document.activeElement).toBe(last);
  });
});
