// The proof code has its own entry point so its curves load only with the 5chan Pass page.
import { getWalletMessageToSign } from '@bitsocial/bitsocial-react-hooks/author-wallet-proof';
import { getAccountVoteSigner } from '../directory-vote-signer';

export interface PassWallet {
  address: string;
  timestamp: number;
  signature: { signature: string; type: 'eip191' };
}

interface PassAccount {
  author?: { wallets?: Record<string, { address?: unknown } | undefined> };
}

export const isEthWalletAddress = (value: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * The text a wallet signs to prove it belongs to this device, as BSIP-22 specifies it: it names the device's key
 * address (`signer.address`, never `author.address`) and the wallet itself, so there is nothing to sign until the
 * wallet address is entered. Empty until then, and for a signer address that is not a key address, which only
 * hand-edited raw data can produce.
 */
export const getPassWalletMessage = (authorPublicKey: string | undefined, walletAddress: string, timestamp: number): string => {
  if (!authorPublicKey || !isEthWalletAddress(walletAddress)) return '';
  try {
    return getWalletMessageToSign(authorPublicKey, walletAddress, timestamp);
  } catch {
    return '';
  }
};

/**
 * The wallet a 5chan Pass login put on this device, or undefined when the device only has the wallet
 * derived from its own key, which is there from the start and is not a login.
 */
export const getPassLoginWalletAddress = (account: unknown): string | undefined => {
  const walletAddress = (account as PassAccount | undefined)?.author?.wallets?.eth?.address;
  // Raw data edits and imported backups are saved unchecked, so the address may not be a string.
  if (typeof walletAddress !== 'string' || !walletAddress) return undefined;
  const builtInAddress = getAccountVoteSigner(account)?.address;
  return builtInAddress && builtInAddress.toLowerCase() === walletAddress.toLowerCase() ? undefined : walletAddress;
};
