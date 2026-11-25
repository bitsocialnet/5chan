import { describe, expect, it } from 'vitest';
import { getPassLoginWalletAddress, getPassWalletMessage, isEthWalletAddress } from '../pass-wallet-utils';

// 31 zero bytes then 0x01: the secp256k1 private key `1`, whose Ethereum address is well known.
const PRIVATE_KEY_ONE_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=';
const PRIVATE_KEY_ONE_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const EXTERNAL_ADDRESS = '0x00000000000000000000000000000000000000AA';

// The BSIP-22 test vector (BSIPs assets/bsip-22/wallet-proof-vectors.json). Test keys only.
const AUTHOR_KEY_ADDRESS = '12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5';
const WALLET_ADDRESS = '0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c';
const TIMESTAMP = 1790000000;
const PROOF_MESSAGE = `{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"${AUTHOR_KEY_ADDRESS}","walletAddress":"${WALLET_ADDRESS.toLowerCase()}","timestamp":${TIMESTAMP}}`;

describe('getPassWalletMessage', () => {
  it('builds the BSIP-22 string over the key address and the lowercase wallet address', () => {
    expect(getPassWalletMessage(AUTHOR_KEY_ADDRESS, WALLET_ADDRESS, TIMESTAMP)).toBe(PROOF_MESSAGE);
  });

  it('is empty until there is a complete wallet address and a key address', () => {
    expect(getPassWalletMessage(AUTHOR_KEY_ADDRESS, '', TIMESTAMP)).toBe('');
    expect(getPassWalletMessage(AUTHOR_KEY_ADDRESS, '0x5050', TIMESTAMP)).toBe('');
    expect(getPassWalletMessage(undefined, WALLET_ADDRESS, TIMESTAMP)).toBe('');
    // a signer address from hand-edited raw data must not crash the page
    expect(getPassWalletMessage('name.bso', WALLET_ADDRESS, TIMESTAMP)).toBe('');
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
