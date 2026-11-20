import { useTranslation } from 'react-i18next';
import type { CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';
import CopyErrorLabel from '../copy-error-label';
import { getCommunityLoadFailureDetails } from './community-load-failure-details';

interface CommunityLoadFailedProps {
  /** The board that failed to load, or every board of a multi-board feed when none of them loaded. */
  communityIdentifier: CommunityIdentifier | CommunityIdentifier[] | undefined;
  /** Set while the board is still being retried, when no peer has served it yet. */
  showOfflineHint?: boolean;
}

/** A board's Failed status; clicking Failed copies everything known about the failure. */
const CommunityLoadFailed = ({ communityIdentifier, showOfflineHint = false }: CommunityLoadFailedProps) => {
  const { t } = useTranslation();
  const getError = () =>
    Array.isArray(communityIdentifier) ? communityIdentifier.map(getCommunityLoadFailureDetails) : getCommunityLoadFailureDetails(communityIdentifier);
  return (
    <div>
      <CopyErrorLabel label={t('failed')} getError={getError} />
      {showOfflineHint && <> {t('board_may_be_offline')}</>}
    </div>
  );
};

export default CommunityLoadFailed;
