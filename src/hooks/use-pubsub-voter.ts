import { useMemo } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { PubsubVoter } from '@bitsocial/pubsub-voting';
import { getBrowserHeliaNode, getBrowserNameResolvers } from '../lib/browser-libp2p-account';
import { getOrCreateBrowserPubsubVoter } from '../lib/pubsub-voter';

export { getBrowserHeliaNode, getBrowserNameResolvers };

interface VoterConstruction {
  voter?: PubsubVoter;
  error?: Error;
}

export type PubsubVoterState =
  | { state: 'unavailable'; voter?: undefined; error?: undefined }
  | { state: 'constructing'; voter?: undefined; error?: undefined }
  | { state: 'ready'; voter: PubsubVoter; error?: undefined }
  | { state: 'failed'; voter?: undefined; error: Error };

export const usePubsubVoter = (): PubsubVoterState => {
  const account = useAccount();
  const helia = getBrowserHeliaNode(account);
  const nameResolvers = getBrowserNameResolvers(account);
  // getOrCreateBrowserPubsubVoter caches one voter per node and resolver set, so repeated renders reuse it.
  const construction = useMemo<VoterConstruction | undefined>(() => {
    if (!helia) return undefined;

    try {
      return { voter: getOrCreateBrowserPubsubVoter({ helia, nameResolvers }) };
    } catch (error) {
      const constructionError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to construct pubsub voter', constructionError);
      return { error: constructionError };
    }
  }, [helia, nameResolvers]);

  if (!helia || !construction) return { state: 'unavailable' };
  if (construction.error) return { state: 'failed', error: construction.error };
  if (construction.voter) return { state: 'ready', voter: construction.voter };
  return { state: 'constructing' };
};
