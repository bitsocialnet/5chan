import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './modal-frame.module.css';

interface ModalFrameProps {
  title: ReactNode;
  titleId: string;
  /** The label of the backdrop, which closes the modal too. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

// The frame renders into document.body, outside the app's #root, and makes #root inert while it is open: nothing
// behind the dialog can take focus, by Tab, click or script, so Escape always reaches the dialog. It keeps the
// open attribute rather than showModal(), whose top layer would change the frame's layout and backdrop. The opener
// is noted before #root turns inert (which would blur it) and refocused once #root is usable again. Module-level
// so it runs once per mounted dialog.
const holdFocusWhileMounted = (dialog: HTMLDialogElement | null) => {
  if (!dialog) return;
  const opener = document.activeElement;
  const appRoot = document.getElementById('root');
  appRoot?.setAttribute('inert', '');
  dialog.focus();
  return () => {
    appRoot?.removeAttribute('inert');
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Escape closes, and Tab wraps between the dialog's first and last controls instead of leaving for the browser.
const handleDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>, onClose: () => void) => {
  if (event.key === 'Escape') {
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const leavingStart = event.shiftKey && (active === first || active === event.currentTarget);
  if (!first || leavingStart || (!event.shiftKey && active === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
};

/** The imageboard utility modal: a dimmed backdrop, a centered dialog with a title bar and close icon, and a scrolling body. */
const ModalFrame = ({ title, titleId, closeLabel, onClose, children }: ModalFrameProps) =>
  createPortal(
    <div className={styles.backdrop}>
      <button
        type='button'
        tabIndex={-1}
        className={styles.backdropButton}
        aria-label={closeLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <dialog
        open
        ref={holdFocusWhileMounted}
        tabIndex={-1}
        className={styles.dialog}
        aria-modal='true'
        aria-labelledby={titleId}
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <div className={styles.hd}>
          <h2 id={titleId}>{title}</h2>
          <button type='button' className={styles.closeButton} onClick={onClose} title='Close' aria-label='Close' />
        </div>
        <div className={styles.bd}>{children}</div>
      </dialog>
    </div>,
    document.body,
  );

/** A text field in the frame's style; `className` adds layout. */
export const ModalFrameInput = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={className ? `${styles.input} ${className}` : styles.input} />
);

export default ModalFrame;
