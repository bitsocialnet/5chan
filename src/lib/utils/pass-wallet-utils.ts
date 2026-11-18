import { getAccountVoteSigner } from '../directory-vote-signer';

export interface PassWallet {
  address: string;
  timestamp: number;
  signature: { signature: string; type: 'eip191' };
}

interface PassAccount {
  author?: { wallets?: Record<string, { address?: string } | undefined> };
}

/**
 * The text a wallet signs to prove it belongs to this device. Boards verify the signature against the
 * same string, so the property order and the lack of spaces are part of the format (it matches
 * bitsocial-react-hooks' getWalletMessageToSign).
 */
export const getPassWalletMessage = (authorAddress: string, timestamp: number): string =>
  `{"domainSeparator":"pkc-author-wallet","authorAddress":"${authorAddress}","timestamp":${timestamp}}`;

/**
 * The wallet a 5chan Pass login put on this device, or undefined when the device only has the wallet
 * derived from its own key, which is there from the start and is not a login.
 */
export const getPassLoginWalletAddress = (account: unknown): string | undefined => {
  const walletAddress = (account as PassAccount | undefined)?.author?.wallets?.eth?.address;
  if (!walletAddress) return undefined;
  const builtInAddress = getAccountVoteSigner(account)?.address;
  return builtInAddress && builtInAddress.toLowerCase() === walletAddress.toLowerCase() ? undefined : walletAddress;
};

export const isEthWalletAddress = (value: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(value);
