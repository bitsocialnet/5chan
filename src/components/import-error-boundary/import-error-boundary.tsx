import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isImportFailure, reloadAfterImportFailure } from '../../lib/import-failures';
import styles from './import-error-boundary.module.css';

/** Reports a failed import with a reload, in the page or, in place of a modal, at the top of the screen. */
export const ImportError = ({ floating = false }: { floating?: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className={floating ? `${styles.error} ${styles.floating}` : styles.error} role='alert'>
      {t('thread_update_connection_error')} [
      <button type='button' onClick={() => void reloadAfterImportFailure()}>
        {t('refresh')}
      </button>
      ]
    </div>
  );
};

type ImportErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  /** Shows the default fallback at the top of the screen, for a modal. */
  floating?: boolean;
};

/**
 * Renders `fallback` (ImportError by default) when a lazy component under it failed to import (see
 * lib/import-failures), where the uncaught error would unmount the whole app and leave a blank page.
 * Other errors pass through.
 */
class ImportErrorBoundary extends Component<ImportErrorBoundaryProps, { error: unknown; failed: boolean }> {
  state = { error: undefined as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    if (!isImportFailure(this.state.error)) {
      throw this.state.error;
    }
    return this.props.fallback === undefined ? <ImportError floating={this.props.floating} /> : this.props.fallback;
  }
}

export default ImportErrorBoundary;
