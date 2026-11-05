import { useSyncExternalStore } from 'react';
import { getTripcodeCommentSource, parseTripcodeProof } from '../lib/utils/tripcode-utils';
import { useCommunityField } from './use-stable-community';

type TripcodeCrypto = typeof import('../lib/tripcode-crypto');

// The verifier loads once, when the first post with a tripcode proof mounts.
let tripcodeCrypto: TripcodeCrypto | undefined;
let tripcodeCryptoLoad: Promise<void> | undefined;
const tripcodeCryptoListeners = new Set<() => void>();

const subscribeToTripcodeCrypto = (listener: () => void) => {
  tripcodeCryptoListeners.add(listener);
  if (!tripcodeCrypto && !tripcodeCryptoLoad) {
    tripcodeCryptoLoad = import('../lib/tripcode-crypto').then(
      (module) => {
        tripcodeCrypto = module;
        for (const notify of tripcodeCryptoListeners) notify();
      },
      () => {
        tripcodeCryptoLoad = undefined;
      },
    );
  }
  return () => {
    tripcodeCryptoListeners.delete(listener);
  };
};

const subscribeToNothing = () => () => {};

const getTripcodeCrypto = () => tripcodeCrypto;

const getCommunityPublicKey = (community: { publicKey?: unknown } | undefined) => (typeof community?.publicKey === 'string' ? community.publicKey : undefined);

/** The verified `!trip` / `!!trip` of a comment whose name carries a tripcode proof, or undefined. */
const useCommentTripcode = (comment: unknown): string | undefined => {
  const source = getTripcodeCommentSource(comment);
  const proof = parseTripcodeProof(source?.displayName);
  // A local pending comment has not been given the board's public key yet; the loaded board has it.
  const fallbackCommunityPublicKey = useCommunityField(proof && !source?.fields.communityPublicKey ? source?.communityAddress : undefined, getCommunityPublicKey);
  const crypto = useSyncExternalStore(proof ? subscribeToTripcodeCrypto : subscribeToNothing, getTripcodeCrypto);

  const communityPublicKey = source?.fields.communityPublicKey ?? fallbackCommunityPublicKey;
  if (!crypto || !proof || !source || !communityPublicKey) return undefined;
  return crypto.getVerifiedTrip(proof, { ...source.fields, communityPublicKey });
};

export default useCommentTripcode;
