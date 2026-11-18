import { useMemo } from 'react';
import { useAccount, useResolvedAuthorAddress } from '@bitsocial/bitsocial-react-hooks';

type PublishAuthorDomainBlockReason = 'resolving' | 'unresolved' | 'mismatch';

const isDomainAddress = (address: unknown): address is string => typeof address === 'string' && address.includes('.');

// Only a device set up before 5chan dropped user names, or restored from another app's backup, still
// posts under a name. Nothing in 5chan's settings mentions it, so the messages say where to remove it.
export const getPublishAuthorDomainErrorMessage = (reason: PublishAuthorDomainBlockReason) => {
  if (reason === 'mismatch') {
    return 'This device posts under a name that now belongs to another key. Remove it in Settings > Advanced > Edit raw data.';
  }
  if (reason === 'resolving') {
    return 'The name this device posts under is still being verified. Try again in a moment.';
  }
  return 'The name this device posts under could not be verified. Try again, or remove it in Settings > Advanced > Edit raw data.';
};

const usePublishAuthorDomainGuard = () => {
  const account = useAccount();
  const authorAddress = account?.author?.address;
  const hasDomainAuthor = isDomainAddress(authorAddress);
  const { resolvedAddress, state } = useResolvedAuthorAddress({
    author: hasDomainAuthor ? account?.author : undefined,
    cache: false,
  });

  const blockedReason = useMemo<PublishAuthorDomainBlockReason | undefined>(() => {
    if (!hasDomainAuthor) {
      return undefined;
    }

    if (state === 'succeeded') {
      if (!resolvedAddress) {
        return 'unresolved';
      }
      return resolvedAddress === account?.signer?.address ? undefined : 'mismatch';
    }

    if (state === 'failed') {
      return 'unresolved';
    }

    return 'resolving';
  }, [account?.signer?.address, hasDomainAuthor, resolvedAddress, state]);

  return {
    account,
    blockedReason,
    hasDomainAuthor,
  };
};

export default usePublishAuthorDomainGuard;
