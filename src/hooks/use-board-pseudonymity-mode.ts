import { useDirectoryByAddress } from './use-directories';
import { useSubplebbitField } from './use-stable-subplebbit';

/**
 * Prefer authoritative live board metadata when available, but fall back to the
 * bundled directory entry so known boards can render IDs immediately on first load.
 */
export const useBoardPseudonymityMode = (subplebbitAddress: string | undefined): string | undefined => {
  const directory = useDirectoryByAddress(subplebbitAddress);
  const livePseudonymityMode = useSubplebbitField(subplebbitAddress, (sub) => sub?.features?.pseudonymityMode);

  return livePseudonymityMode ?? directory?.features?.pseudonymityMode;
};
