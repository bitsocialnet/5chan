import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAccountComment } from '@plebbit/plebbit-react-hooks';
import useAccountsStore from '@plebbit/plebbit-react-hooks/dist/stores/accounts';
import useSubplebbitsStore from '@plebbit/plebbit-react-hooks/dist/stores/subplebbits';
import Plebbit from '@plebbit/plebbit-js';
import { useStableSubplebbit } from '../../hooks/use-stable-subplebbit';
import { isAllView, isSubscriptionsView, isModView } from '../../lib/utils/view-utils';
import styles from './board-header.module.css';
import { useDirectoriesMetadata, useDirectories } from '../../hooks/use-directories';
import { useResolvedSubplebbitAddress } from '../../hooks/use-resolved-subplebbit-address';
import useIsMobile from '../../hooks/use-is-mobile';
import useIsSubplebbitOffline from '../../hooks/use-is-subplebbit-offline';
import { shouldShowSnow } from '../../lib/snow';
import Tooltip from '../tooltip';
import { startCase } from 'lodash';
import { BANNERS } from '../../generated/asset-manifest';

const ImageBanner = () => {
  const [banner] = useState(() => BANNERS[Math.floor(Math.random() * BANNERS.length)]);

  return <img src={banner} alt='' />;
};

// Separate component for offline indicator to isolate rerenders from updatingState
// Only this component will rerender when updatingState changes, not the whole BoardHeader
const OfflineIndicator = ({ subplebbitAddress }: { subplebbitAddress: string | undefined }) => {
  // Subscribe to full subplebbit including transient state for offline detection
  const subplebbit = useSubplebbitsStore((state) => (subplebbitAddress ? state.subplebbits[subplebbitAddress] : undefined));
  const { isOffline, isOnlineStatusLoading, offlineIconClass, offlineTitle } = useIsSubplebbitOffline(subplebbit);

  if (!isOffline && !isOnlineStatusLoading) {
    return null;
  }

  return (
    <span className={styles.offlineIconWrapper}>
      <Tooltip content={offlineTitle}>
        <span className={`${styles.offlineIcon} ${offlineIconClass}`} />
      </Tooltip>
    </span>
  );
};

const BoardHeader = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, useParams());
  const isInModView = isModView(location.pathname);
  const accountComment = useAccountComment({ commentIndex: params?.accountCommentIndex as any });
  const resolvedAddress = useResolvedSubplebbitAddress();
  const subplebbitAddress = resolvedAddress || accountComment?.subplebbitAddress;

  // Use stable subplebbit for display fields to avoid rerenders from updatingState
  const stableSubplebbit = useStableSubplebbit(subplebbitAddress);
  const { address, shortAddress } = stableSubplebbit || {};

  const directoriesMetadata = useDirectoriesMetadata();
  const directories = useDirectories();

  // Find matching subplebbit from default list to get its title
  const defaultSubplebbit = subplebbitAddress ? directories.find((s) => s.address === subplebbitAddress) : null;

  // Use accounts store with selector to only subscribe to subscriptions count
  const subscriptionsCount = useAccountsStore((state) => {
    const activeAccountId = state.activeAccountId;
    const activeAccount = activeAccountId ? state.accounts[activeAccountId] : undefined;
    return activeAccount?.subscriptions?.length || 0;
  });
  const subscriptionsSubtitle = t('subscriptions_subtitle', { count: subscriptionsCount });

  const title = isInAllView
    ? directoriesMetadata?.title || '/all/ - 5chan Directories'
    : isInSubscriptionsView
      ? '/subs/ - Subscriptions'
      : isInModView
        ? startCase(t('boards_you_moderate'))
        : defaultSubplebbit?.title || stableSubplebbit?.title;
  const subtitle = isInAllView ? '' : isInSubscriptionsView ? subscriptionsSubtitle : isInModView ? '/mod/' : `${address || subplebbitAddress || ''}`;

  return (
    <div className={`${styles.content} ${shouldShowSnow() ? styles.garland : ''}`}>
      {!useIsMobile() && (
        <div className={styles.bannerCnt}>
          <ImageBanner key={isInAllView ? 'all' : isInSubscriptionsView ? 'subscriptions' : subplebbitAddress} />
        </div>
      )}
      <div className={styles.boardTitle}>
        {title ||
          (shortAddress
            ? shortAddress.endsWith('.eth') || shortAddress.endsWith('.sol')
              ? shortAddress.slice(0, -4)
              : shortAddress
            : subplebbitAddress && Plebbit.getShortAddress({ address: subplebbitAddress }))}
        {!isInAllView && !isInSubscriptionsView && !isInModView && <OfflineIndicator subplebbitAddress={subplebbitAddress} />}
      </div>
      <div className={styles.boardSubtitle}>
        {isInSubscriptionsView ? (
          <span className={styles.clickableSubtitle} onClick={() => navigate('/subs/settings#subscriptions-settings')}>
            {subtitle}
          </span>
        ) : !isInAllView && !isInModView && subtitle ? (
          <span title={t('board_address_tooltip')}>{subtitle}</span>
        ) : (
          subtitle
        )}
      </div>
      <hr />
    </div>
  );
};

export default BoardHeader;
