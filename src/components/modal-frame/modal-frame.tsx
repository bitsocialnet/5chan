import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './modal-frame.module.css';

interface ModalFrameProps {
  title: ReactNode;
  titleId: string;
  /** The label of the backdrop, which closes the modal too. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

// The opener sits behind the dialog, so the dialog takes focus when it mounts: keyboard users land in it and
// Escape reaches its handler. Module-level so it runs once per mounted dialog.
const focusOnMount = (dialog: HTMLDialogElement | null) => dialog?.focus();

/** The imageboard utility modal: a dimmed backdrop, a centered dialog with a title bar and close icon, and a scrolling body. */
const ModalFrame = ({ title, titleId, closeLabel, onClose, children }: ModalFrameProps) => (
  <div className={styles.backdrop}>
    <button
      type='button'
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
      ref={focusOnMount}
      tabIndex={-1}
      className={styles.dialog}
      aria-modal='true'
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
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
