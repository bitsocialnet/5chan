import * as ed from '@noble/ed25519';
import * as cborg from 'cborg';

/**
 * A board running a Bitsocial Spam Blocker that accepts pre-check passes publishes `<serverUrl>/precheck`
 * as that challenge's public text. The client runs the check before uploading an attached file, then
 * pre-supplies the pre-check session id as the challenge's answer, which the board redeems instead of
 * showing its iframe. The pass only works for a post with the same author on the same board.
 */
const PRECHECK_PATH_SUFFIX = '/precheck';

export interface SpamBlockerPrecheckPlan {
  /** The spam blocker server's API base, e.g. `https://spamblocker.bitsocial.net/api/v1`. */
  serverUrl: string;
  /** The post's `challengeAnswers`: the pass at each spam blocker that checks it, its other answers in free slots. */
  getChallengeAnswers: (pass: string) => string[];
}

export interface PrecheckPublicationContext {
  isReply: boolean;
  /** The author's role on the board; boards often exclude moderators from their challenges. */
  authorRole?: string;
  /** Answers the post carries anyway, such as a country flag the flags challenge finds in any slot. */
  otherAnswers?: string[];
}

export interface PrecheckPublication {
  author: { address: string; displayName?: string };
  content?: string;
  flairs?: unknown[];
  parentCid?: string;
  postCid?: string;
  spoiler?: boolean;
  timestamp: number;
  title?: string;
}

export type SpamBlockerPrecheckStatus = 'pending' | 'completed' | 'failed';

const isLocalhost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const getPrecheckServerUrl = (challenge: unknown): string | undefined => {
  const { type, challenge: text } = (challenge ?? {}) as { type?: unknown; challenge?: unknown };
  if (type !== 'url/iframe' || typeof text !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost(url.hostname))) return undefined;
  if (url.search || url.hash || !url.pathname.endsWith(PRECHECK_PATH_SUFFIX)) return undefined;
  return `${url.origin}${url.pathname.slice(0, -PRECHECK_PATH_SUFFIX.length)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Whether the board certainly skips this challenge for the post. Like pkc-js, an exclude item applies when
 * all its conditions match; only the publication type and the author's role can be checked here, so an
 * item with any other condition (karma, rate limits, other challenges) is never counted as applying.
 */
const isExcludedForPost = (challenge: unknown, { isReply, authorRole }: PrecheckPublicationContext) => {
  const excludes = isRecord(challenge) && Array.isArray(challenge.exclude) ? challenge.exclude : [];
  return excludes.some((exclude) => {
    if (!isRecord(exclude)) return false;
    const conditions = Object.entries(exclude).filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0));
    if (conditions.length === 0) return false;
    return conditions.every(([key, value]) => {
      if (key === 'publicationType') return isRecord(value) && value[isReply ? 'reply' : 'post'] === true;
      if (key === 'roles') return Array.isArray(value) && authorRole !== undefined && value.includes(authorRole);
      return false;
    });
  });
};

/** A challenge that publishes its own question (pkc-js `question`) reads its slot as the author's answer. */
const readsItsAnswer = (challenge: unknown) => isRecord(challenge) && typeof challenge.challenge === 'string' && challenge.challenge.trim() !== '';

/**
 * Plans where the pass goes in `challengeAnswers`: at the index of each spam blocker that checks this post.
 * Every slot before the last one is filled too, which is harmless for challenges that ignore pre-supplied
 * answers (fail, whitelists, flags) but not for one that reads its slot as an answer, so such a board is not
 * pre-checked. The post's other answers go in slots no challenge reads. Without a plan the post is published
 * as before and the board checks it after the upload.
 */
export const getSpamBlockerPrecheckPlan = (challenges: unknown, context: PrecheckPublicationContext): SpamBlockerPrecheckPlan | undefined => {
  if (!Array.isArray(challenges)) return undefined;
  const serverUrl = challenges.map(getPrecheckServerUrl).find(Boolean);
  if (!serverUrl) return undefined;

  const isSkipped = (index: number) => isExcludedForPost(challenges[index], context);
  const passIndexes = challenges.flatMap((challenge, index) => (getPrecheckServerUrl(challenge) === serverUrl && !isSkipped(index) ? [index] : []));
  if (passIndexes.length === 0) return undefined;

  const lastPassIndex = passIndexes[passIndexes.length - 1];
  const freeSlots: number[] = [];
  for (let index = 0; index <= lastPassIndex; index++) {
    if (passIndexes.includes(index)) continue;
    if (readsItsAnswer(challenges[index]) && !isSkipped(index)) return undefined;
    freeSlots.push(index);
  }
  const otherAnswers = context.otherAnswers ?? [];
  for (let index = lastPassIndex + 1; freeSlots.length < otherAnswers.length; index++) {
    if (index < challenges.length && readsItsAnswer(challenges[index]) && !isSkipped(index)) return undefined;
    freeSlots.push(index);
  }

  return {
    serverUrl,
    getChallengeAnswers: (pass) => {
      const answers = Array<string>(Math.max(lastPassIndex + 1, ...freeSlots.slice(0, otherAnswers.length).map((index) => index + 1))).fill('');
      for (const index of passIndexes) answers[index] = pass;
      otherAnswers.forEach((answer, position) => {
        answers[freeSlots[position]] = answer;
      });
      return answers;
    },
  };
};

export const createPrecheckSessionId = () => `precheck-${crypto.randomUUID()}`;

const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** CBOR encodes undefined as a value of its own, which the server would then sign over too. */
const withoutUndefined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

/**
 * The pre-check request, signed by the author's key so the spam blocker scores the author who will publish.
 * Returned as the base64url CBOR payload the pre-check iframe reads from its URL fragment.
 */
export const createSignedPrecheckPayload = async ({
  communityAddress,
  privateKey,
  publication,
  sessionId,
  timestamp,
}: {
  communityAddress: string;
  privateKey: string;
  publication: PrecheckPublication;
  sessionId: string;
  timestamp: number;
}) => {
  const privateKeyBytes = base64ToBytes(privateKey);
  const propsToSign = {
    sessionId,
    communityAddress,
    publication: withoutUndefined({ ...publication, author: withoutUndefined(publication.author) }),
    timestamp,
  };
  // noble checks `instanceof Uint8Array`, which cborg's output can fail when it is a Buffer from another realm.
  const signedBytes = Uint8Array.from(cborg.encode(propsToSign));
  const [signature, publicKey] = await Promise.all([ed.sign(signedBytes, privateKeyBytes), ed.getPublicKey(privateKeyBytes)]);
  const payload = { ...propsToSign, signature: { signature, publicKey, type: 'ed25519', signedPropertyNames: Object.keys(propsToSign) } };
  return bytesToBase64Url(cborg.encode(payload));
};

export const getPrecheckIframeUrl = ({ payload, serverUrl, sessionId }: { payload: string; serverUrl: string; sessionId: string }) =>
  `${serverUrl}/iframe/${encodeURIComponent(sessionId)}/precheck#payload=${payload}`;

/** Reads the pre-check's outcome once its iframe has answered, which it also does after showing a rejection. */
export const fetchPrecheckStatus = async ({
  serverUrl,
  sessionId,
}: {
  serverUrl: string;
  sessionId: string;
}): Promise<{ status: SpamBlockerPrecheckStatus; message?: string }> => {
  const response = await fetch(`${serverUrl}/challenge/status/${encodeURIComponent(sessionId)}`, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error(`Spam blocker status request failed (${response.status})`);
  const body = (await response.json()) as { status?: unknown; outcome?: { message?: unknown } | null };
  const status = body?.status;
  if (status !== 'pending' && status !== 'completed' && status !== 'failed') throw new Error('Spam blocker returned no status for this check');
  const message = typeof body.outcome?.message === 'string' && body.outcome.message.trim() ? body.outcome.message.trim() : undefined;
  return { status, message };
};
