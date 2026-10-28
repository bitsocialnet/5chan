import * as ed from '@noble/ed25519';
import * as cborg from 'cborg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrecheckSessionId, createSignedPrecheckPayload, fetchPrecheckStatus, getPrecheckIframeUrl, getSpamBlockerPrecheckPlan } from '../spam-blocker-precheck';

const spamBlocker = (serverUrl = 'https://spamblocker.bitsocial.net/api/v1') => ({ type: 'url/iframe', challenge: `${serverUrl}/precheck` });

const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('getSpamBlockerPrecheckPlan', () => {
  const post = { isReply: false };
  const reply = { isReply: true };
  const modRoles = { roles: ['moderator', 'admin', 'owner'] };
  // 5chan's default board challenges (src/data/board-defaults.ts) as pkc-js publishes them.
  const defaultBoard = [
    { type: 'text/plain', exclude: [modRoles, { rateLimit: 5, rateLimitChallengeSuccess: false }] },
    { type: 'text/plain', exclude: [modRoles, { publicationType: { post: true, reply: true, vote: true } }] },
    { ...spamBlocker(), exclude: [{ publicationType: { reply: true } }, modRoles, { postCount: 10, firstCommentTimestamp: 604800 }] },
    { ...spamBlocker(), exclude: [{ publicationType: { post: true } }, modRoles, { replyCount: 20, firstCommentTimestamp: 604800 }] },
  ];

  it('puts the pass at the spam blocker that checks the post, past challenges that ignore answers', () => {
    expect(getSpamBlockerPrecheckPlan(defaultBoard, post)?.getChallengeAnswers('pass')).toEqual(['', '', 'pass']);
    expect(getSpamBlockerPrecheckPlan(defaultBoard, reply)?.getChallengeAnswers('pass')).toEqual(['', '', '', 'pass']);
    expect(getSpamBlockerPrecheckPlan(defaultBoard, post)?.serverUrl).toBe('https://spamblocker.bitsocial.net/api/v1');
  });

  it("keeps the post's country flag answer in a slot no challenge reads", () => {
    const flag = 'bitsocial-flags:5chan:flag:country:auto';
    expect(getSpamBlockerPrecheckPlan(defaultBoard, { ...post, otherAnswers: [flag] })?.getChallengeAnswers('pass')).toEqual([flag, '', 'pass']);
    expect(getSpamBlockerPrecheckPlan([spamBlocker()], { ...post, otherAnswers: [flag] })?.getChallengeAnswers('pass')).toEqual(['pass', flag]);
  });

  it("does not pre-check a post the board's spam blocker skips", () => {
    expect(getSpamBlockerPrecheckPlan(defaultBoard, { ...post, authorRole: 'moderator' })).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([defaultBoard[2]], reply)).toBeUndefined();
  });

  it('pre-checks when an exclude depends on something only the board knows, such as karma', () => {
    expect(getSpamBlockerPrecheckPlan([{ ...spamBlocker(), exclude: [{ postCount: 10 }] }], post)?.getChallengeAnswers('pass')).toEqual(['pass']);
  });

  it('is not used when a challenge that reads its own answer would get the pass or another answer', () => {
    const question = { type: 'text/plain', challenge: 'What is 2+2?' };
    expect(getSpamBlockerPrecheckPlan([question, spamBlocker()], post)).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([spamBlocker(), question], { ...post, otherAnswers: ['flag'] })).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([spamBlocker(), question], post)?.getChallengeAnswers('pass')).toEqual(['pass']);
    expect(getSpamBlockerPrecheckPlan([{ ...question, exclude: [{ publicationType: { post: true } }] }, spamBlocker()], post)?.getChallengeAnswers('pass')).toEqual([
      '',
      'pass',
    ]);
  });

  it('pre-checks with the first spam blocker when the board runs two on different servers', () => {
    const plan = getSpamBlockerPrecheckPlan([spamBlocker('https://other.example/api/v1'), spamBlocker()], post);
    expect(plan?.serverUrl).toBe('https://other.example/api/v1');
    // The second one, on another server, does not take this pass and checks the post itself after the upload.
    expect(plan?.getChallengeAnswers('pass')).toEqual(['pass']);
  });

  it('ignores spam blockers that publish no pre-check URL and insecure or malformed URLs', () => {
    expect(getSpamBlockerPrecheckPlan([{ type: 'url/iframe' }], post)).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([{ type: 'url/iframe', challenge: 'http://spamblocker.example/api/v1/precheck' }], post)).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([{ type: 'url/iframe', challenge: 'https://spamblocker.example/api/v1/evaluate' }], post)).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([{ type: 'text/plain', challenge: 'https://spamblocker.example/api/v1/precheck' }], post)).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan(undefined, post)).toBeUndefined();
    expect(getSpamBlockerPrecheckPlan([{ type: 'url/iframe', challenge: 'http://localhost:3000/api/v1/precheck' }], post)?.serverUrl).toBe(
      'http://localhost:3000/api/v1',
    );
  });
});

describe('createSignedPrecheckPayload', () => {
  it('signs the request with the author key the way the spam blocker verifies it', async () => {
    const privateKey = ed.utils.randomPrivateKey();
    const sessionId = createPrecheckSessionId();
    const payload = await createSignedPrecheckPayload({
      communityAddress: 'music-posting.eth',
      privateKey: toBase64(privateKey),
      publication: { author: { address: 'author.bso', displayName: undefined }, content: 'hello', title: undefined, timestamp: 1_700_000_000 },
      sessionId,
      timestamp: 1_700_000_001,
    });

    const decoded = cborg.decode(fromBase64Url(payload)) as Record<string, unknown> & {
      signature: { signature: Uint8Array; publicKey: Uint8Array; type: string; signedPropertyNames: string[] };
    };
    expect(sessionId).toMatch(/^precheck-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(decoded.publication).toEqual({ author: { address: 'author.bso' }, content: 'hello', timestamp: 1_700_000_000 });
    expect(decoded.signature.type).toBe('ed25519');
    expect(decoded.signature.signedPropertyNames).toEqual(['sessionId', 'communityAddress', 'publication', 'timestamp']);
    expect(decoded.signature.publicKey).toEqual(await ed.getPublicKey(privateKey));

    // The server re-encodes the named properties of the decoded body and verifies them.
    const signed = Object.fromEntries(decoded.signature.signedPropertyNames.map((name) => [name, decoded[name]]));
    const bytes = (value: Uint8Array) => Uint8Array.from(value);
    expect(await ed.verify(bytes(decoded.signature.signature), bytes(cborg.encode(signed)), bytes(decoded.signature.publicKey))).toBe(true);
  });
});

describe('getPrecheckIframeUrl', () => {
  it('puts the session in the iframe path the challenge modal reads, and the payload in the fragment', () => {
    expect(getPrecheckIframeUrl({ payload: 'abc', serverUrl: 'https://spamblocker.example/api/v1', sessionId: 'precheck-1' })).toBe(
      'https://spamblocker.example/api/v1/iframe/precheck-1/precheck#payload=abc',
    );
  });
});

describe('fetchPrecheckStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the status and the rejection message', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'failed', outcome: { title: 'Blocked', message: ' You are blocked from posting ' } })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPrecheckStatus({ serverUrl: 'https://spamblocker.example/api/v1', sessionId: 'precheck-1' })).resolves.toEqual({
      status: 'failed',
      message: 'You are blocked from posting',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://spamblocker.example/api/v1/challenge/status/precheck-1', expect.objectContaining({ credentials: 'omit' }));
  });

  it('fails when the server answers without a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ completed: false, error: 'Session not found' }))),
    );
    await expect(fetchPrecheckStatus({ serverUrl: 'https://spamblocker.example/api/v1', sessionId: 'precheck-1' })).rejects.toThrow('no status');
  });
});
