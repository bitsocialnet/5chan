import useCommentTripcode, { useTripcodeVerifierDownloadFailed } from '../../hooks/use-comment-tripcode';
import { ImportError } from '../import-error-boundary';
import styles from './poster-trip.module.css';

/** A comment's verified tripcode, set after its name as 4chan's `.postertrip`. Renders nothing otherwise. */
const PosterTrip = ({ comment }: { comment: unknown }) => {
  const trip = useCommentTripcode(comment);
  if (!trip) return null;
  return (
    <>
      {' '}
      <span className={styles.postertrip}>{trip}</span>
    </>
  );
};

/** Offers a reload, once per page, when the tripcode verifier failed to download and trips are hidden. */
export const TripcodeVerifierImportError = () => (useTripcodeVerifierDownloadFailed() ? <ImportError floating /> : null);

export default PosterTrip;
