import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { communitiesStore as useCommunitiesStore } from '../lib/bitsocial-internals/stores';
import { applyCommunityWordfilters } from '../lib/bitsocial-internals/utils';
import type { TripcodeSecret } from '../lib/utils/tripcode-utils';
import { getCommunityByAddress } from './use-stable-community';

type TripcodePublishOptions = Parameters<typeof import('../lib/tripcode-crypto').createTripcodePublishOptions>[0]['publishOptions'];

const MAX_SIGNING_ATTEMPTS = 3;

interface SignTripcodeOptions<T extends TripcodePublishOptions> {
  secret: TripcodeSecret;
  /** The publish options as they are now. */
  readOptions: () => T | undefined;
  /** Saves the options to publish, with the proof's displayName and the timestamp it signs. */
  writeOptions: (options: T & { displayName: string; timestamp: number }) => void;
  /** False once the publish was dropped, such as when its form closed. */
  isActive: () => boolean;
}

/**
 * Signs a comment's final publish options with the author's tripcode and saves them. Deriving the key takes
 * a moment, during which the options can change (an edit, or a closed form's reset), so the proof is signed
 * again over the latest options until they hold still, and nothing is saved once the publish was dropped.
 * Resolves to whether the options were signed; rejects with a message the form can show.
 */
const useSignTripcode = () => {
  const { t } = useTranslation();

  return useCallback(
    async <T extends TripcodePublishOptions>({ secret, readOptions, writeOptions, isActive }: SignTripcodeOptions<T>): Promise<boolean> => {
      try {
        const { createTripcodePublishOptions } = await import('../lib/tripcode-crypto');
        // Each attempt reads the options the previous one found changed, so attempts run one after another.
        const signLatestOptions = async (attemptsLeft: number): Promise<boolean> => {
          if (attemptsLeft === 0) throw new Error('The publish options kept changing while the tripcode was signed');
          const options = readOptions();
          if (!options || !isActive()) return false;
          const community = getCommunityByAddress(useCommunitiesStore.getState().communities, options.communityAddress) as
            | { publicKey?: unknown; challenges?: unknown }
            | undefined;
          const signed = await createTripcodePublishOptions({ publishOptions: options, secret, community, applyWordfilters: applyCommunityWordfilters });
          if (!isActive()) return false;
          if (readOptions() !== options) return signLatestOptions(attemptsLeft - 1);
          writeOptions({ ...options, ...signed });
          return true;
        };
        return await signLatestOptions(MAX_SIGNING_ATTEMPTS);
      } catch (error) {
        console.error(error);
        throw new Error(`${t('error')}: ${t('tripcode_sign_failed')}`);
      }
    },
    [t],
  );
};

export default useSignTripcode;
