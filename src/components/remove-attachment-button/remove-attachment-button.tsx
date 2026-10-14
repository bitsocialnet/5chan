import { useTranslation } from 'react-i18next';
import styles from './remove-attachment-button.module.css';

/** Bracketed [×] next to a form's file name that drops the attached file or its uploaded link. */
const RemoveAttachmentButton = ({ onClick }: { onClick: () => void }) => {
  const { t } = useTranslation();
  return (
    <span className={styles.removeAttachment}>
      [
      <button type='button' className={styles.button} aria-label={t('remove')} title={t('remove')} onClick={onClick}>
        ×
      </button>
      ]
    </span>
  );
};

export default RemoveAttachmentButton;
