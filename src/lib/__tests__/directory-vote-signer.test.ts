import { describe, expect, it } from 'vitest';
import { ballotTypedData, EIP712_SIGNATURE_TYPE } from '@bitsocial/pubsub-voting';
import { recoverTypedDataAddress } from 'viem';
import { getAccountVoteSigner } from '../directory-vote-signer';

// 31 zero bytes then 0x01: the secp256k1 private key `1`, whose Ethereum address is well known.
const PRIVATE_KEY_ONE_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=';
const PRIVATE_KEY_ONE_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';

describe('getAccountVoteSigner', () => {
  it('derives the voting address from the account key like the default author.wallets.eth', () => {
    const accountVoteSigner = getAccountVoteSigner({ signer: { privateKey: PRIVATE_KEY_ONE_BASE64 } });

    expect(accountVoteSigner?.address).toBe(PRIVATE_KEY_ONE_ADDRESS);
    expect(accountVoteSigner?.signer.address()).toBe(PRIVATE_KEY_ONE_ADDRESS);
  });

  it('ignores a replaced author.wallets.eth and memoizes per key', () => {
    const account = { signer: { privateKey: PRIVATE_KEY_ONE_BASE64 }, author: { wallets: { eth: { address: '0x0000000000000000000000000000000000000001' } } } };

    expect(getAccountVoteSigner(account)?.address).toBe(PRIVATE_KEY_ONE_ADDRESS);
    expect(getAccountVoteSigner(account)).toBe(getAccountVoteSigner({ signer: { privateKey: PRIVATE_KEY_ONE_BASE64 } }));
  });

  it('returns undefined for missing or malformed keys', () => {
    expect(getAccountVoteSigner(undefined)).toBeUndefined();
    expect(getAccountVoteSigner({ signer: {} })).toBeUndefined();
    expect(getAccountVoteSigner({ signer: { privateKey: 'private key' } })).toBeUndefined();
    expect(getAccountVoteSigner({ signer: { privateKey: 'AAAA' } })).toBeUndefined();
  });

  it('signs ballots that recover to the voting address', async () => {
    const accountVoteSigner = getAccountVoteSigner({ signer: { privateKey: PRIVATE_KEY_ONE_BASE64 } })!;
    const typedData = ballotTypedData({
      criteriaCid: new Uint8Array(36).fill(7),
      chainId: 84532,
      votes: [{ community: { name: 'board.bso', publicKey: '12D3KooWR7nTdKZqZ1twGWMfVsXYDGp1XAKUrnYznKP651jFrizE' }, vote: 1 }],
      blockNumber: 1800,
    });

    const signature = await accountVoteSigner.signer.signBallot(typedData);

    expect(signature.type).toBe(EIP712_SIGNATURE_TYPE);
    await expect(recoverTypedDataAddress({ ...typedData, signature: signature.signature as `0x${string}` })).resolves.toBe(PRIVATE_KEY_ONE_ADDRESS);
  });
});
