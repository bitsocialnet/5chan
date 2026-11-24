import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import styles from './modal-frame.module.css';

interface ModalFrameProps {
  title: ReactNode;
  titleId: string;
  /** The label of the backdrop, which closes the modal too. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

// The opener sits behind the dialog, so the dialog takes focus when it mounts (keyboard users land in it and
// Escape reaches its handler) and gives it back to the opener when it unmounts. Module-level so it runs once per
// mounted dialog.
const focusWhileMounted = (dialog: HTMLDialogElement | null) => {
  if (!dialog) return;
  const opener = document.activeElement;
  dialog.focus();
  return () => {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Escape closes, and Tab wraps between the dialog's first and last controls: the dialog is opened without
// showModal(), which would make the page behind it inert, so the backdrop alone keeps the mouse out.
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
const ModalFrame = ({ title, titleId, closeLabel, onClose, children }: ModalFrameProps) => (
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
      ref={focusWhileMounted}
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
  </div>
);

/** A text field in the frame's style; `className` adds layout. */
export const ModalFrameInput = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={className ? `${styles.input} ${className}` : styles.input} />
);

export default ModalFrame;
