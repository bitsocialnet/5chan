import { useTranslation } from 'react-i18next';
import type { CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';
import { getCommunityLoadFailureDetails } from '../../stores/use-community-load-failures-store';
import CopyErrorLabel from '../copy-error-label';

interface CommunityLoadFailedProps {
  communityIdentifier: CommunityIdentifier | undefined;
  /** Set while the board is still being retried, when no peer has served it yet. */
  showOfflineHint?: boolean;
}

/** A board's Failed status; clicking Failed copies everything known about the failure. */
const CommunityLoadFailed = ({ communityIdentifier, showOfflineHint = false }: CommunityLoadFailedProps) => {
  const { t } = useTranslation();
  return (
    <div>
      <CopyErrorLabel label={t('failed')} getError={() => getCommunityLoadFailureDetails(communityIdentifier)} />
      {showOfflineHint && <> {t('board_may_be_offline')}</>}
    </div>
  );
};

export default CommunityLoadFailed;
