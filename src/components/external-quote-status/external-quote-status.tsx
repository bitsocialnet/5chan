import useExternalQuoteStatusStore from '../../stores/use-external-quote-status-store';
import styles from './external-quote-status.module.css';

const ExternalQuoteStatus = () => {
  const message = useExternalQuoteStatusStore((state) => state.message);

  if (!message) {
    return null;
  }

  return (
    <div className={`${styles.container} ${styles.error}`} role='alert'>
      {message}
    </div>
  );
};

export default ExternalQuoteStatus;
