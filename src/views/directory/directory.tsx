import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { shouldShowSnow } from '../../stores/use-special-theme-store';
import { BottomButton, BracketedCatalogButton, CatalogButton, ReturnButton, TopButton } from '../../components/board-buttons';
import { PageFooterDesktop, PageFooterMobile, ThreadFooterStyleRow } from '../../components/footer';
import LoadingEllipsis from '../../components/loading-ellipsis';
import Tooltip from '../../components/tooltip';
import { useDirectories } from '../../hooks/use-directories';
import useIsMobile from '../../hooks/use-is-mobile';
import { useCommunityIdentifier } from '../../hooks/use-community-identifiers';
import { useResolvedCommunityAddress } from '../../hooks/use-resolved-community-address';
import { isDirectoryRoute } from '../../lib/utils/route-utils';
import type { DirectoryListBoard } from '../../lib/utils/directory-list-utils';
import { useDirectoryList } from '../../hooks/use-directory-list';
import { type CommunityFreshnessState, isCommunityKnownOffline } from '../../lib/utils/community-freshness-utils';
import getShortAddress from '../../lib/get-short-address';
import { get5chanDeveloperBadge } from '../../lib/utils/author-display-utils';
import useCommunityOfflineStore from '../../stores/use-community-offline-store';
import useIsCommunityOffline from '../../hooks/use-is-community-offline';
import { useNowSeconds } from '../../hooks/use-now-seconds';
import { useVoteTally } from '../../hooks/use-vote-tally';
import { type DirectoryVoteOutcome, useDirectoryVote } from '../../hooks/use-directory-vote';
import { rankDirectoryBoardsByVoteTally, type RankedDirectoryVoteBoard } from '../../lib/directory-vote-ranking';
import { isTestnetVotingChain, TESTNET_PASS_FAUCET_URL } from '../../lib/pubsub-voter';
import postStyles from '../../components/post-styles';
import styles from '../../components/directory-layout';

const DIRECTORY_STATUS_CHECK_LIMIT = 5;
const DIRECTORY_STATUS_UNAVAILABLE_MARKER = '\u2014';

const computeBoardStatus = (
  communityState: CommunityFreshnessState | undefined,
  offlineState: CommunityFreshnessState | undefined,
  nowSeconds: number,
  isOffline: boolean,
  isOnlineStatusLoading: boolean,
): 'online' | 'offline' | 'loading' | 'unknown' => {
  const freshnessState = {
    state: communityState?.state ?? offlineState?.state,
    syncState: communityState?.syncState,
    updatedAt: communityState?.updatedAt ?? offlineState?.updatedAt,
  };

  if (isOffline || isCommunityKnownOffline(freshnessState, nowSeconds)) return 'offline';
  if (isOnlineStatusLoading) return 'loading';
  if (!freshnessState.updatedAt) return 'unknown';
  return 'online';
};

const PASS_LINK = '/pass';

const SUBMIT_BOARD_INPUT_ID = 'directory-submit-board';

const DirectoryDesktopTopControls = ({ communityAddress }: { communityAddress: string | undefined }) => (
  <div className={styles.desktopNavLinks}>
    <div className={styles.navButtonGroup}>
      <span>
        [<ReturnButton address={communityAddress} />]
      </span>
      <BracketedCatalogButton address={communityAddress} />
      <span>
        [<BottomButton />]
      </span>
    </div>
  </div>
);

const DirectoryDesktopFooterControls = ({ communityAddress }: { communityAddress: string | undefined }) => (
  <div className={styles.desktopFooterButtons}>
    <div className={styles.navButtonGroup}>
      <span>
        [<ReturnButton address={communityAddress} />]
      </span>
      <BracketedCatalogButton address={communityAddress} />
      <span>
        [<TopButton />]
      </span>
    </div>
  </div>
);

const DirectoryMobileTopControls = ({ communityAddress }: { communityAddress: string | undefined }) => (
  <div className={styles.mobileNavLinks}>
    <div>
      <ReturnButton address={communityAddress} />
      <CatalogButton address={communityAddress} />
      <BottomButton />
    </div>
  </div>
);

const DirectoryMobileFooterControls = ({ communityAddress }: { communityAddress: string | undefined }) => (
  <div className={styles.mobileFooterButtons}>
    <div>
      <ReturnButton address={communityAddress} />
      <CatalogButton address={communityAddress} />
      <TopButton />
    </div>
  </div>
);

/** Submitting a board is voting for it: the tally lists any board a Pass holder votes for. */
const DirectorySubmitBoardForm = ({ isBusy, isPending, onSubmit }: { isBusy: boolean; isPending: boolean; onSubmit: (address: string) => Promise<boolean> }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [address, setAddress] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!address.trim() || isBusy) return;
    if (await onSubmit(address)) setAddress('');
  };

  if (!isOpen) {
    const openButton = (
      <button type='button' className='button' onClick={() => setIsOpen(true)}>
        {t('directory_submit_board')}
      </button>
    );
    return <div className={styles.submitBoardToggle}>{isMobile ? openButton : <>[{openButton}]</>}</div>;
  }

  return (
    <form className={styles.submitBoardForm} onSubmit={handleSubmit}>
      <label htmlFor={SUBMIT_BOARD_INPUT_ID}>{t('directory_submit_board')}:</label>{' '}
      <input
        id={SUBMIT_BOARD_INPUT_ID}
        type='text'
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder='board.bso'
        autoComplete='off'
        autoCapitalize='off'
        autoCorrect='off'
        spellCheck={false}
        // The form mounts only when the user opens it, so take them straight to the field.
        autoFocus
      />{' '}
      [
      <button type='submit' className={styles.actionButton} disabled={isBusy} aria-label={t('upvote')} title={t('upvote')}>
        {isPending ? '...' : '+1'}
      </button>
      ]
    </form>
  );
};

type VoteNotice = Exclude<DirectoryVoteOutcome, { status: 'voted' } | { status: 'withdrawn' }> & { boardAddress?: string };

const DirectoryVoteNotice = ({ notice, boardIdentifier, noContest }: { notice: VoteNotice; boardIdentifier: string; noContest: boolean }) => {
  const { t } = useTranslation();

  let content;
  if (notice.status === 'ineligible') {
    content = (
      <Trans
        i18nKey={notice.testnet ? 'directory_vote_needs_test_pass' : 'directory_vote_needs_pass'}
        values={{ address: notice.address }}
        components={{
          address: <span className={styles.voteNoticeAddress} />,
          passLink: <Link to={PASS_LINK} />,
          faucetLink: <a href={TESTNET_PASS_FAUCET_URL} target='_blank' rel='noreferrer noopener' />,
        }}
      />
    );
  } else if (notice.status === 'unavailable') {
    content = noContest ? t('directory_voting_no_contest', { boardIdentifier }) : t('directory_voting_unavailable');
  } else if (notice.status === 'board-not-found') {
    content = t('directory_vote_board_not_found', { address: notice.boardAddress });
  } else {
    content = t('directory_vote_failed', { error: notice.error.message });
  }

  return (
    <div className={styles.voteNotice} role='status'>
      {content}
    </div>
  );
};

interface DirectoryRowProps {
  rankedBoard: RankedDirectoryVoteBoard;
  nowSeconds: number;
  rank: number;
  isVoted: boolean;
  isVotePending: boolean;
  isVotingBusy: boolean;
  onVote: () => void;
}

const DirectoryRow = ({ rankedBoard, nowSeconds, rank, isVoted, isVotePending, isVotingBusy, onVote }: DirectoryRowProps) => {
  const { t } = useTranslation();
  const { board, chainVerified, nameResolved, weight } = rankedBoard;
  const statusUnavailableReason = t('directory_status_unavailable_reason');
  const ownerAddress = board.owner;
  const ownerDisplay = ownerAddress ? getShortAddress(ownerAddress) || ownerAddress : undefined;
  const developerBadge = get5chanDeveloperBadge(ownerAddress);
  const shouldCheckStatus = rank <= DIRECTORY_STATUS_CHECK_LIMIT;
  const communityIdentifier = useCommunityIdentifier(shouldCheckStatus ? board.address : undefined);
  const community = useCommunity(shouldCheckStatus && communityIdentifier ? { community: communityIdentifier } : undefined);
  const { isOffline, isOnlineStatusLoading } = useIsCommunityOffline(community, shouldCheckStatus ? board.address : undefined);
  const offlineState = useCommunityOfflineStore((state) => (shouldCheckStatus ? state.communityOfflineState[board.address] : undefined));
  const status = shouldCheckStatus ? computeBoardStatus(community, offlineState, nowSeconds, isOffline, isOnlineStatusLoading) : 'unavailable';
  const boardLink = `/${board.address}`;
  const isVoteVerificationPending = weight !== undefined && (!chainVerified || nameResolved === false);
  const score = weight?.toString() ?? board.score ?? DIRECTORY_STATUS_UNAVAILABLE_MARKER;

  return (
    <tr className={`${styles.dirRow} ${rank % 2 === 1 ? styles.rowOdd : ''}`}>
      <td className={styles.numberCell}>{rank}</td>
      <td className={styles.boardCol}>{board.address}</td>
      <td className={styles.ownerCell}>
        <span className={developerBadge ? `${styles.ownerName} ${postStyles.capcodeAdmin}` : undefined}>
          {ownerDisplay ?? t('directory_owner_anonymous')}
          {developerBadge && (
            <>
              {' '}
              <span className={styles.ownerCapcode}>
                ## {developerBadge.label} <span className={`${postStyles.capcodeIcon} ${postStyles.capcodeAdminIcon}`} title={developerBadge.title} />
              </span>
            </>
          )}
        </span>
      </td>
      <td className={styles.statusCell}>
        {status === 'unavailable' ? (
          <span className={styles.statusUnavailable}>
            {DIRECTORY_STATUS_UNAVAILABLE_MARKER}
            <Tooltip content={statusUnavailableReason}>
              <button type='button' className={styles.statusUnavailableHelp} aria-label={statusUnavailableReason} tabIndex={0}>
                ?
              </button>
            </Tooltip>
          </span>
        ) : status === 'loading' ? (
          <span className={styles.statusLoading}>
            <LoadingEllipsis centered string={t('loading')} />
          </span>
        ) : status === 'unknown' ? (
          <span className={styles.statusUnavailable}>{DIRECTORY_STATUS_UNAVAILABLE_MARKER}</span>
        ) : (
          <span className={status === 'offline' ? styles.statusOffline : styles.statusOnline}>
            {t(status === 'offline' ? 'directory_status_offline' : 'directory_status_online')}
          </span>
        )}
      </td>
      <td className={styles.scoreCell}>
        <span className={styles.scoreValue} data-score-verification={weight === undefined ? 'fallback' : isVoteVerificationPending ? 'pending' : 'verified'}>
          {score}
          {isVoteVerificationPending && (
            <sup className={styles.scorePending} title={t('pending')} aria-label={t('pending')}>
              ?
            </sup>
          )}
        </span>
      </td>
      <td className={styles.actionsCell}>
        [
        <button
          type='button'
          className={styles.actionButton}
          onClick={onVote}
          disabled={isVotingBusy}
          aria-pressed={isVoted}
          aria-label={isVoted ? t('directory_unvote') : t('upvote')}
          title={isVoted ? t('directory_unvote') : t('upvote')}
        >
          {isVotePending ? '...' : isVoted ? t('directory_unvote') : '+1'}
        </button>
        ] [
        <Link to={boardLink} className={styles.viewLink}>
          {t('view')}
        </Link>
        ]
      </td>
    </tr>
  );
};

const Directory = () => {
  const { t } = useTranslation();
  const params = useParams();
  const boardIdentifier = params.boardIdentifier;
  const directories = useDirectories();
  const isValidDirectoryCode = !!boardIdentifier && isDirectoryRoute(boardIdentifier, directories);
  const { list, loading } = useDirectoryList(isValidDirectoryCode ? boardIdentifier : undefined);
  const communityAddress = useResolvedCommunityAddress();
  const nowSeconds = useNowSeconds();
  const voteTally = useVoteTally(isValidDirectoryCode ? boardIdentifier : undefined);
  const tally = voteTally.state === 'ready' ? voteTally.tally : undefined;
  const isTestnetVote = !!voteTally.criteria && isTestnetVotingChain(voteTally.criteria.bucketChainId);
  const { votedCommunity, pendingVote, toggleVote, voteForAddress } = useDirectoryVote(voteTally);
  const [voteNotice, setVoteNotice] = useState<VoteNotice>();

  const ranked = useMemo(() => (list ? rankDirectoryBoardsByVoteTally(list.boards, tally, { orderByVotes: !isTestnetVote }) : []), [list, tally, isTestnetVote]);
  const directoryTitle = list?.title || (boardIdentifier ? `/${boardIdentifier}/ - ${t('directory')}` : t('directory'));

  useEffect(() => {
    if (!isValidDirectoryCode) return;
    document.title = `${directoryTitle} - 5chan`;
  }, [directoryTitle, isValidDirectoryCode]);

  if (!isValidDirectoryCode) {
    return <Navigate to='/not-found' replace />;
  }

  const showVoteOutcome = (outcome: DirectoryVoteOutcome, boardAddress?: string) => {
    if (outcome.status === 'voted' || outcome.status === 'withdrawn') return true;
    setVoteNotice({ ...outcome, boardAddress });
    return false;
  };

  // A listed board may lack a public key; such rows match the stored vote by name and resolve on click.
  const getRowKey = (board: DirectoryListBoard) => board.publicKey ?? board.address;
  const isVotedBoard = (board: DirectoryListBoard) =>
    !!votedCommunity && (board.publicKey ? board.publicKey === votedCommunity.publicKey : board.address === votedCommunity.name);

  const handleVote = async ({ board }: RankedDirectoryVoteBoard) => {
    setVoteNotice(undefined);
    if (votedCommunity && isVotedBoard(board)) return showVoteOutcome(await toggleVote(votedCommunity));
    if (!board.publicKey) return showVoteOutcome(await voteForAddress(board.address, { source: 'row', key: getRowKey(board) }), board.address);
    return showVoteOutcome(await toggleVote({ name: board.address.includes('.') ? board.address : undefined, publicKey: board.publicKey }));
  };

  const handleSubmitBoard = async (address: string) => {
    setVoteNotice(undefined);
    return showVoteOutcome(await voteForAddress(address), address.trim());
  };

  const isLoadingShell = loading && ranked.length === 0;
  const boardCount = ranked.length;
  const isVotingBusy = pendingVote !== undefined;

  return (
    <div id='top' className={`${styles.page} ${shouldShowSnow() ? styles.garland : ''}`} data-pubsub-vote-tally-state={voteTally.state}>
      <DirectoryMobileTopControls communityAddress={communityAddress} />
      <hr className={styles.desktopDivider} />
      <DirectoryDesktopTopControls communityAddress={communityAddress} />
      <hr className={styles.divider} />
      {isLoadingShell ? (
        <h4 className={styles.directorySummary}>
          <LoadingEllipsis string={t('loading_directory')} />
        </h4>
      ) : ranked.length === 0 ? (
        <h4 className={styles.directorySummary}>{t('directory_empty')}</h4>
      ) : (
        <h4 className={styles.directorySummary}>{t('directory_heading', { boardIdentifier, count: boardCount })}</h4>
      )}
      {voteNotice && (
        <DirectoryVoteNotice notice={voteNotice} boardIdentifier={boardIdentifier!} noContest={voteTally.state === 'unavailable' && voteTally.reason === 'no-contest'} />
      )}

      {!isLoadingShell && ranked.length > 0 && (
        <>
          <table className={styles.flashListing}>
            <thead>
              <tr>
                <th className={styles.postblock} scope='col'>
                  No.
                </th>
                <th className={styles.postblock} scope='col'>
                  {t('directory_board')}
                </th>
                <th className={styles.postblock} scope='col'>
                  {t('directory_owner')}
                </th>
                <th className={styles.postblock} scope='col'>
                  {t('directory_status')}
                </th>
                <th className={styles.postblock} scope='col'>
                  {/* Testnet votes don't rank the list, so they must not read as its score. */}
                  {isTestnetVote ? t('directory_test_votes') : t('directory_score')}
                </th>
                <th className={styles.postblock} scope='col'>
                  {t('directory_vote')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((rankedBoard, index) => (
                <DirectoryRow
                  key={rankedBoard.board.publicKey ?? rankedBoard.board.address}
                  rankedBoard={rankedBoard}
                  nowSeconds={nowSeconds}
                  rank={index + 1}
                  isVoted={isVotedBoard(rankedBoard.board)}
                  isVotePending={pendingVote?.source === 'row' && pendingVote.key === getRowKey(rankedBoard.board)}
                  isVotingBusy={isVotingBusy}
                  onVote={() => handleVote(rankedBoard)}
                />
              ))}
            </tbody>
          </table>
        </>
      )}

      {!isLoadingShell && (
        <>
          <DirectorySubmitBoardForm isBusy={isVotingBusy} isPending={pendingVote?.source === 'form'} onSubmit={handleSubmitBoard} />
          <div className={styles.directoryFootnote}>
            <Trans i18nKey='directory_footnote' components={{ passLink: <Link to={PASS_LINK} /> }} />
            {isTestnetVote && <> {t('directory_votes_testnet')}</>}
          </div>
        </>
      )}

      <PageFooterDesktop firstRow={<DirectoryDesktopFooterControls communityAddress={communityAddress} />} styleRow={<ThreadFooterStyleRow />} />
      <PageFooterMobile>
        <DirectoryMobileFooterControls communityAddress={communityAddress} />
      </PageFooterMobile>
    </div>
  );
};

export default Directory;
