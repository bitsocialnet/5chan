import useCommentTripcode from '../../hooks/use-comment-tripcode';
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

export default PosterTrip;
