import { useEffect } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { getBrowserHeliaNode, getBrowserNameResolvers } from '../lib/browser-libp2p-account';
import useDirectoryVotesStore from '../stores/use-directory-votes-store';

const REFRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface SigningAccount {
  signer?: { privateKey?: string };
}

/**
 * Keeps the account's directory votes alive while 5chan is open: on start, on refocus, and hourly.
 * The refresh is imported only once a vote is stored, so the libraries it signs and publishes with
 * (viem and pubsub-voting) stay out of the JavaScript loaded before the first render.
 */
export const useDirectoryVoteRefresh = () => {
  const account = useAccount();
  const privateKey = (account as SigningAccount | undefined)?.signer?.privateKey;
  const helia = getBrowserHeliaNode(account);
  const nameResolvers = getBrowserNameResolvers(account);

  useEffect(() => {
    if (!privateKey || !helia) return;

    let running = false;
    const run = () => {
      if (running || Object.keys(useDirectoryVotesStore.getState().votes).length === 0) return;
      running = true;
      import('./use-directory-vote')
        .then(({ refreshAccountDirectoryVotes }) => refreshAccountDirectoryVotes({ privateKey, helia, nameResolvers }))
        .catch((error) => console.warn('Failed to refresh directory votes', error))
        .finally(() => {
          running = false;
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') run();
    };

    run();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(run, REFRESH_CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [privateKey, helia, nameResolvers]);
};
