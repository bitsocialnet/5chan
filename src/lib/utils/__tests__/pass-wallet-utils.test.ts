import { describe, expect, it } from 'vitest';
import { getPassLoginWalletAddress, getPassWalletMessage, isEthWalletAddress } from '../pass-wallet-utils';

// 31 zero bytes then 0x01: the secp256k1 private key `1`, whose Ethereum address is well known.
const PRIVATE_KEY_ONE_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=';
const PRIVATE_KEY_ONE_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const EXTERNAL_ADDRESS = '0x00000000000000000000000000000000000000AA';

describe('getPassWalletMessage', () => {
  it('builds the exact string boards verify a wallet signature against', () => {
    expect(getPassWalletMessage('12D3KooWKey', 1700000000)).toBe('{"domainSeparator":"pkc-author-wallet","authorAddress":"12D3KooWKey","timestamp":1700000000}');
  });
});

describe('getPassLoginWalletAddress', () => {
  it('does not count the wallet derived from the device key as a login', () => {
    const account = { signer: { privateKey: PRIVATE_KEY_ONE_BASE64 }, author: { wallets: { eth: { address: PRIVATE_KEY_ONE_ADDRESS.toLowerCase() } } } };

    expect(getPassLoginWalletAddress(account)).toBeUndefined();
  });

  it('returns a wallet the user logged in with', () => {
    const account = { signer: { privateKey: PRIVATE_KEY_ONE_BASE64 }, author: { wallets: { eth: { address: EXTERNAL_ADDRESS } } } };

    expect(getPassLoginWalletAddress(account)).toBe(EXTERNAL_ADDRESS);
  });

  it('returns undefined without a wallet', () => {
    expect(getPassLoginWalletAddress(undefined)).toBeUndefined();
    expect(getPassLoginWalletAddress({ author: {} })).toBeUndefined();
  });

  it('treats a non-string address from hand-edited data as no login instead of throwing', () => {
    const account = { signer: { privateKey: PRIVATE_KEY_ONE_BASE64 }, author: { wallets: { eth: { address: 42 } } } };

    expect(getPassLoginWalletAddress(account)).toBeUndefined();
  });
});

describe('isEthWalletAddress', () => {
  it('accepts only 0x followed by 40 hex characters', () => {
    expect(isEthWalletAddress(EXTERNAL_ADDRESS)).toBe(true);
    expect(isEthWalletAddress('0x1234')).toBe(false);
    expect(isEthWalletAddress('vitalik.eth')).toBe(false);
    expect(isEthWalletAddress(`${EXTERNAL_ADDRESS}0`)).toBe(false);
  });
});
