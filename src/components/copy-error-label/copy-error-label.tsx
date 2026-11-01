import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import capitalize from 'lodash/capitalize';
import { copyToClipboard } from '../../lib/utils/clipboard-utils';
import { serializeErrorForClipboard } from '../../lib/utils/error-utils';
import styles from './copy-error-label.module.css';

const FEEDBACK_MS = 1500;

interface CopyErrorLabelProps {
  label: string;
  /** Read on click, so the copy holds what is known then rather than at render. */
  getError: () => unknown;
}

/** A red error status, such as Failed or Connection Error, that copies the full error when clicked. */
const CopyErrorLabel = ({ label, getError }: CopyErrorLabelProps) => {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(feedbackTimerRef.current), []);

  const handleClick = async () => {
    if (feedback) return;
    let result: 'copied' | 'failed' = 'copied';
    try {
      await copyToClipboard(serializeErrorForClipboard(getError()));
    } catch (error) {
      console.error('Failed to copy error: ', error);
      result = 'failed';
    }
    setFeedback(result);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  };

  const text = feedback === 'copied' ? capitalize(t('copied')) : feedback === 'failed' ? capitalize(t('copyFailed', 'copy failed')) : label;
  return (
    <button
      type='button'
      className={feedback === 'copied' ? `${styles.copyErrorLabel} ${styles.copied}` : styles.copyErrorLabel}
      onClick={handleClick}
      title={capitalize(t('copyFullError', 'copy full error'))}
    >
      {text}
    </button>
  );
};

export default CopyErrorLabel;
