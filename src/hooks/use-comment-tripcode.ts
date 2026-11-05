import { useSyncExternalStore } from 'react';
import { isImportFailure, markImportFailures } from '../lib/import-failures';
import { getTripcodeCommentSource, parseTripcodeProof } from '../lib/utils/tripcode-utils';
import { useCommunityField } from './use-stable-community';

type TripcodeCrypto = typeof import('../lib/tripcode-crypto');

interface TripcodeVerifier {
  crypto?: TripcodeCrypto;
  /** The last load failed to download, which only a reload can retry (see lib/import-failures). */
  downloadFailed?: boolean;
}

const loadTripcodeCrypto = markImportFailures(() => import('../lib/tripcode-crypto'));

// The verifier loads when the first post with a tripcode proof mounts. After a failed load, the next
// post that mounts tries again; a browser can fail that too without fetching, so a failed download
// also offers a reload (useTripcodeVerifierDownloadFailed).
let verifier: TripcodeVerifier = {};
let verifierLoad: Promise<void> | undefined;
const verifierListeners = new Set<() => void>();

const setVerifier = (next: TripcodeVerifier) => {
  verifier = next;
  for (const notify of verifierListeners) notify();
};

const subscribeToVerifier = (listener: () => void) => {
  verifierListeners.add(listener);
  return () => {
    verifierListeners.delete(listener);
  };
};

const subscribeToVerifierLoad = (listener: () => void) => {
  const unsubscribe = subscribeToVerifier(listener);
  if (!verifier.crypto && !verifierLoad) {
    verifierLoad = loadTripcodeCrypto().then(
      (crypto) => {
        verifierLoad = undefined;
        setVerifier({ crypto });
      },
      (error: unknown) => {
        verifierLoad = undefined;
        console.warn('Failed to load the tripcode verifier', error);
        setVerifier({ downloadFailed: isImportFailure(error) });
      },
    );
  }
  return unsubscribe;
};

const subscribeToNothing = () => () => {};

const getTripcodeCrypto = () => verifier.crypto;

const getVerifierDownloadFailed = () => verifier.downloadFailed === true;

/** Whether the tripcode verifier failed to download, which leaves trips hidden until a reload. */
export const useTripcodeVerifierDownloadFailed = (): boolean => useSyncExternalStore(subscribeToVerifier, getVerifierDownloadFailed);

const getCommunityPublicKey = (community: { publicKey?: unknown } | undefined) => (typeof community?.publicKey === 'string' ? community.publicKey : undefined);

/** The verified `!trip` / `!!trip` of a comment whose name carries a tripcode proof, or undefined. */
const useCommentTripcode = (comment: unknown): string | undefined => {
  const source = getTripcodeCommentSource(comment);
  const proof = parseTripcodeProof(source?.displayName);
  // A local pending comment has not been given the board's public key yet; the loaded board has it.
  const fallbackCommunityPublicKey = useCommunityField(proof && !source?.fields.communityPublicKey ? source?.communityAddress : undefined, getCommunityPublicKey);
  const crypto = useSyncExternalStore(proof ? subscribeToVerifierLoad : subscribeToNothing, getTripcodeCrypto);

  const communityPublicKey = source?.fields.communityPublicKey ?? fallbackCommunityPublicKey;
  if (!crypto || !proof || !source || !communityPublicKey) return undefined;
  return crypto.getVerifiedTrip(proof, { ...source.fields, communityPublicKey });
};

export default useCommentTripcode;
