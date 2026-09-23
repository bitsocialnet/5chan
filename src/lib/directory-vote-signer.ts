import { EIP712_SIGNATURE_TYPE, type VoteSigner } from '@bitsocial/pubsub-voting';
import { toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

interface VotingAccount {
  signer?: { privateKey?: string };
}

export interface AccountVoteSigner {
  /** The voting wallet; the 5chan Pass must be held by this address. */
  address: string;
  signer: VoteSigner;
}

const signersByPrivateKey = new Map<string, AccountVoteSigner>();

/**
 * The 5chan account's built-in ETH wallet: the same derivation bitsocial-react-hooks uses for the
 * default `author.wallets.eth` (the 32-byte account key read as a secp256k1 key). Ballots are
 * signed silently with it, so voting needs no browser wallet and refreshes need no prompt. The
 * address comes from the key, not from `author.wallets.eth`, which a user may have replaced with
 * an external wallet this app cannot sign for. Memoized so the result is referentially stable.
 */
export const getAccountVoteSigner = (account: unknown): AccountVoteSigner | undefined => {
  const privateKeyBase64 = (account as VotingAccount | undefined)?.signer?.privateKey;
  if (!privateKeyBase64) return undefined;

  const cached = signersByPrivateKey.get(privateKeyBase64);
  if (cached) return cached;

  // A malformed or out-of-range key (e.g. all zeros) disables voting instead of crashing the render.
  let wallet: ReturnType<typeof privateKeyToAccount>;
  try {
    const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (char) => char.charCodeAt(0));
    if (privateKeyBytes.length !== 32) return undefined;
    wallet = privateKeyToAccount(toHex(privateKeyBytes));
  } catch {
    return undefined;
  }
  const accountVoteSigner: AccountVoteSigner = {
    address: wallet.address,
    signer: {
      address: () => wallet.address,
      signBallot: async (typedData) => ({ signature: await wallet.signTypedData(typedData), type: EIP712_SIGNATURE_TYPE }),
    },
  };
  signersByPrivateKey.set(privateKeyBase64, accountVoteSigner);
  return accountVoteSigner;
};
