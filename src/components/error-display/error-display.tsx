import { useReducer, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '../../lib/utils/clipboard-utils';
import styles from './error-display.module.css';

type State = { showAfterDelay: boolean; feedbackMessageKey: string | null };

function reducer(state: State, action: { type: 'RESET_DELAY' } | { type: 'SHOW' } | { type: 'FEEDBACK'; payload: string | null }): State {
  if (action.type === 'RESET_DELAY') return { ...state, showAfterDelay: false };
  if (action.type === 'SHOW') return { ...state, showAfterDelay: true };
  if (action.type === 'FEEDBACK') return { ...state, feedbackMessageKey: action.payload };
  return state;
}

const ErrorDisplay = ({ error }: { error: any }) => {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, { showAfterDelay: false, feedbackMessageKey: null });

  const hasError = !!(error?.message || error?.stack || error?.details || error);

  useEffect(() => {
    if (!hasError) {
      queueMicrotask(() => dispatch({ type: 'RESET_DELAY' }));
      return;
    }
    const timer = setTimeout(() => dispatch({ type: 'SHOW' }), 1000);
    return () => clearTimeout(timer);
  }, [hasError]);

  if (!hasError || !state.showAfterDelay) {
    return null;
  }

  const originalDisplayMessage = error?.message ? `${t('error')}: ${error.message}` : typeof error === 'string' ? error : null;

  const handleMessageClick = async () => {
    if (!error || !error.message || state.feedbackMessageKey) return;

    const errorString = JSON.stringify(error, null, 2);
    try {
      await copyToClipboard(errorString);
      dispatch({ type: 'FEEDBACK', payload: 'copied' });
      setTimeout(() => dispatch({ type: 'FEEDBACK', payload: null }), 1500);
    } catch (err) {
      console.error('Failed to copy error: ', err);
      dispatch({ type: 'FEEDBACK', payload: 'failed' });
      setTimeout(() => dispatch({ type: 'FEEDBACK', payload: null }), 1500);
    }
  };

  let currentDisplayMessage = '';
  const classNames = [styles.errorMessage];
  let isClickable = false;

  if (state.feedbackMessageKey === 'copied') {
    currentDisplayMessage = t('fullErrorCopiedToClipboard', 'full error copied to the clipboard');
    classNames.pop();
    classNames.push(styles.feedbackSuccessMessage);
  } else if (state.feedbackMessageKey === 'failed') {
    currentDisplayMessage = t('copyFailed', 'copy failed');
  } else if (originalDisplayMessage) {
    currentDisplayMessage = originalDisplayMessage;
    isClickable = true;
    classNames.push(styles.clickableErrorMessage);
  }

  return (
    <div className={styles.error}>
      {currentDisplayMessage &&
        (isClickable ? (
          <button
            type='button'
            className={classNames.join(' ')}
            onClick={handleMessageClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMessageClick();
              }
            }}
            title={t('clickToCopyFullError', 'Click to copy full error')}
          >
            {currentDisplayMessage}
          </button>
        ) : (
          <span className={classNames.join(' ')}>{currentDisplayMessage}</span>
        ))}
    </div>
  );
};

export default ErrorDisplay;
