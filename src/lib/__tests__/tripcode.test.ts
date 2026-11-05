import { describe, expect, it } from 'vitest';
import { applyCommunityWordfilters as applyWordfilters } from '../bitsocial-internals/utils';
import { createTripcodeDisplayName, createTripcodePublishOptions, getVerifiedTrip, TripcodeSigningError } from '../tripcode-crypto';
import {
  getTripcodeCommentSource,
  getTripcodeMessage,
  parseTripcodeInput,
  parseTripcodeProof,
  stripTripcodeProof,
  type TripcodeSignedFields,
} from '../utils/tripcode-utils';

const BOARD_KEY = '12D3KooWBoardPublicKeyForTripcodeTests';
const fields: TripcodeSignedFields = {
  communityPublicKey: BOARD_KEY,
  parentCid: 'QmParent',
  postCid: 'QmPost',
  timestamp: 1_800_000_000,
  content: 'hello >>123',
  link: 'https://example.com/a.png',
};

const wordfilter = (rules: Array<{ src: string; dst: string }>) => [{ publicOptions: { 'wordfilter/v1/rules': JSON.stringify(rules) } }];

const verify = (displayName: string, signedFields: TripcodeSignedFields = fields) => {
  const proof = parseTripcodeProof(displayName);
  return proof ? getVerifiedTrip(proof, signedFields) : undefined;
};

describe('parseTripcodeInput', () => {
  it('splits 4chan name field syntax into the name and the passwords', () => {
    expect(parseTripcodeInput('Anon')).toEqual({ name: 'Anon' });
    expect(parseTripcodeInput(' Anon #pass')).toEqual({ name: 'Anon', tripcodeInput: '#pass', secret: { normal: 'pass' } });
    expect(parseTripcodeInput('Anon##secure')).toEqual({ name: 'Anon', tripcodeInput: '##secure', secret: { secure: 'secure' } });
    expect(parseTripcodeInput('Anon#pass##secure')).toEqual({ name: 'Anon', tripcodeInput: '#pass##secure', secret: { normal: 'pass', secure: 'secure' } });
    expect(parseTripcodeInput('#pass')).toEqual({ name: '', tripcodeInput: '#pass', secret: { normal: 'pass' } });
    expect(parseTripcodeInput('Anon#')).toEqual({ name: 'Anon', tripcodeInput: '#' });
  });
});

describe('tripcode proofs', () => {
  it('gives the same trip for the same password on any post, and different trips per kind', async () => {
    const first = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'hunter2' }, fields });
    const second = await createTripcodeDisplayName({
      name: 'Someone else',
      secret: { normal: 'hunter2' },
      fields: { ...fields, parentCid: undefined, postCid: undefined, content: 'other' },
    });
    const secure = await createTripcodeDisplayName({ name: 'Anon', secret: { secure: 'hunter2' }, fields });
    const both = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'hunter2', secure: 'hunter2' }, fields });

    const trip = verify(first);
    expect(trip).toMatch(/^![./0-9A-Za-z]{10}$/);
    expect(verify(second, { ...fields, parentCid: undefined, postCid: undefined, content: 'other' })).toBe(trip);
    expect(verify(secure)).toMatch(/^!![./0-9A-Za-z]{10}$/);
    expect(verify(secure)).not.toBe(`!${trip}`);
    expect(verify(both)).toBe(`${trip}${verify(secure)}`);
    expect(stripTripcodeProof(first)).toBe('Anon');
    expect(first).not.toContain('hunter2');
  });

  it('rejects a proof moved to another post, board, name or time', async () => {
    const displayName = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'hunter2' }, fields });
    expect(verify(displayName)).toBeDefined();
    expect(verify(displayName, { ...fields, content: 'hello >>124' })).toBeUndefined();
    expect(verify(displayName, { ...fields, communityPublicKey: '12D3KooWOtherBoard' })).toBeUndefined();
    expect(verify(displayName, { ...fields, parentCid: 'QmOtherThread' })).toBeUndefined();
    expect(verify(displayName, { ...fields, timestamp: fields.timestamp + 1 })).toBeUndefined();
    expect(verify(`Admin${displayName.slice('Anon'.length)}`)).toBeUndefined();
  });

  it('signs the name and text as the board wordfilter leaves them', async () => {
    const challenges = wordfilter([{ src: 'tbh', dst: 'desu' }]);
    const displayName = await createTripcodeDisplayName({
      name: 'tbh anon',
      secret: { normal: 'pw' },
      fields: { ...fields, content: 'tbh yes' },
      challenges,
      applyWordfilters,
    });
    expect(displayName.startsWith('desu anon#tc1')).toBe(true);
    expect(verify(displayName, { ...fields, content: 'desu yes' })).toBeDefined();
  });

  it('picks another nonce when the wordfilter would rewrite the proof, and fails when no nonce avoids it', async () => {
    const unfiltered = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'pw' }, fields });
    const signature = parseTripcodeProof(unfiltered)?.entries[0].signature as string;
    const challenges = wordfilter([{ src: signature.slice(10, 14), dst: '!' }]);

    const displayName = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'pw' }, fields, challenges, applyWordfilters });
    expect(parseTripcodeProof(displayName)?.nonce).toBeGreaterThan(0);
    expect(verify(displayName)).toBe(verify(unfiltered));

    await expect(
      createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'pw' }, fields, challenges: wordfilter([{ src: 'tc1', dst: 'x' }]), applyWordfilters }),
    ).rejects.toEqual(new TripcodeSigningError('wordfilter'));
  });

  it('needs the board public key and signs the publish options timestamp', async () => {
    await expect(createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'pw' }, fields: { ...fields, communityPublicKey: undefined } })).rejects.toEqual(
      new TripcodeSigningError('board_not_loaded'),
    );

    const { displayName, timestamp } = await createTripcodePublishOptions({
      publishOptions: {
        communityAddress: 'board.bso',
        title: 'Thread',
        content: 'Body',
        author: { displayName: 'Anon' },
        gallery: [{ url: 'https://example.com/b.png' }],
      },
      secret: { normal: 'pw' },
      community: { publicKey: BOARD_KEY },
      applyWordfilters,
    });
    expect(verify(displayName, { communityPublicKey: BOARD_KEY, timestamp, title: 'Thread', content: 'Body', galleryUrls: ['https://example.com/b.png'] })).toBeDefined();
  });

  it('shows no trip on edited text, so a verbatim replay cannot be edited into new text under the trip', async () => {
    const displayName = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'pw' }, fields });
    const original = { ...fields, author: { displayName }, signature: { publicKey: 'attacker-key' } };
    const unedited = getTripcodeCommentSource({ ...original, cid: 'QmReply', raw: { comment: original } });
    const edited = getTripcodeCommentSource({ ...original, cid: 'QmReply', content: 'edited text', raw: { comment: original } });

    expect(verify(displayName, { ...unedited!.fields, communityPublicKey: BOARD_KEY })).toBeDefined();
    expect(edited?.fields.content).toBe('edited text');
    expect(verify(displayName, { ...edited!.fields, communityPublicKey: BOARD_KEY })).toBeUndefined();
  });

  it('signs posts without a thread, whatever postCid the local comment carries', () => {
    const post = { ...fields, parentCid: undefined };
    expect(getTripcodeMessage('normal', 0, 'Anon', post)).toBe(getTripcodeMessage('normal', 0, 'Anon', { ...post, postCid: 'QmOwnCid' }));
  });
});
