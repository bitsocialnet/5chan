import type { Comment } from '@bitsocial/bitsocial-react-hooks';

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
  verifyExemptions?: boolean;
  /** The post's `challengeAnswers`: the pass at each spam blocker that checks it, its other answers in free slots. */
  getChallengeAnswers: (pass: string) => string[];
}

/**
 * What the account's own comments on the board show about its author there. The board counts comments
 * published from other devices too, so these are lower bounds: they can prove an author has the karma a
 * board exempts from its spam blocker, never that the author lacks it.
 */
export interface LocalAuthorHistory {
  postCount: number;
  replyCount: number;
  /** When the earliest of them was published; the author's first comment on the board is no newer. */
  firstCommentTimestamp?: number;
  /** Those of this post's type published in the last hour, which a board's rate limit counts. */
  lastHourCount: number;
}

export interface PrecheckPublicationContext {
  isReply: boolean;
  /** The author's role on the board; boards often exclude moderators from their challenges. */
  authorRole?: string;
  authorHistory?: LocalAuthorHistory;
  /** Answers the post carries anyway, such as a country flag the flags challenge finds in any slot. */
  otherAnswers?: string[];
  /** Seconds since the epoch, for an exclude that needs the author's first comment to be old enough. */
  nowSeconds?: number;
}

export interface PrecheckPublication {
  author: { address: string; name?: string; displayName?: string };
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
  if (url.hash || !url.pathname.endsWith(PRECHECK_PATH_SUFFIX)) return undefined;
  // Policy metadata belongs to the public marker; the server independently verifies the board's policy.
  const policyParameters = [...url.searchParams];
  if (policyParameters.some(([name, value]) => (name !== 'blockTor' && name !== 'precheckExemptions') || (name === 'blockTor' && value !== 'true' && value !== 'false')))
    return undefined;
  if (url.searchParams.getAll('blockTor').length > 1 || url.searchParams.getAll('precheckExemptions').length > 1) return undefined;
  if (url.searchParams.has('precheckExemptions') && !hasVerifiedExemptionCapability(challenge)) return undefined;
  return `${url.origin}${url.pathname.slice(0, -PRECHECK_PATH_SUFFIX.length)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A versioned capability; the server validates the signed policy and the author's identity. */
const hasVerifiedExemptionCapability = (challenge: unknown): boolean => {
  if (!isRecord(challenge) || typeof challenge.challenge !== 'string') return false;
  try {
    const policy: unknown = JSON.parse(new URL(challenge.challenge).searchParams.get('precheckExemptions') ?? 'null');
    return isRecord(policy) && policy.version === 1 && Array.isArray(policy.rules) && policy.rules.length > 0;
  } catch {
    return false;
  }
};

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

/** Builds the author's history on a board from the account's comments there that the board accepted. */
export const getLocalAuthorHistory = ({
  accountComments,
  isReply,
  nowSeconds,
}: {
  accountComments: Comment[];
  isReply: boolean;
  nowSeconds: number;
}): LocalAuthorHistory => {
  const history: LocalAuthorHistory = { postCount: 0, replyCount: 0, lastHourCount: 0 };
  for (const { cid, parentCid, timestamp } of accountComments) {
    if (!cid) continue;
    if (parentCid) history.replyCount++;
    else history.postCount++;
    if (typeof timestamp !== 'number') continue;
    if (history.firstCommentTimestamp === undefined || timestamp < history.firstCommentTimestamp) history.firstCommentTimestamp = timestamp;
    if (Boolean(parentCid) === isReply && timestamp > nowSeconds - RATE_LIMIT_WINDOW_SECONDS) history.lastHourCount++;
  }
  return history;
};

/** Whether one condition of an exclude item certainly holds for the post, following pkc-js's exclude rules. */
const meetsExcludeCondition = (key: string, value: unknown, { authorHistory, authorRole, isReply, nowSeconds }: PrecheckPublicationContext) => {
  switch (key) {
    case 'publicationType':
      return isRecord(value) && value[isReply ? 'reply' : 'post'] === true;
    case 'roles':
      return Array.isArray(value) && authorRole !== undefined && value.includes(authorRole);
    case 'postCount':
      return typeof value === 'number' && authorHistory !== undefined && authorHistory.postCount >= value;
    case 'replyCount':
      return typeof value === 'number' && authorHistory !== undefined && authorHistory.replyCount >= value;
    case 'firstCommentTimestamp':
      return (
        typeof value === 'number' &&
        typeof nowSeconds === 'number' &&
        authorHistory?.firstCommentTimestamp !== undefined &&
        authorHistory.firstCommentTimestamp <= nowSeconds - value
      );
    // The board counts the author's accepted posts of this type in the last hour. Ones from other devices
    // are missing here, so this can let an author over the limit through; the board then still runs its
    // spam blocker after the upload, as it did before pre-checks.
    case 'rateLimit':
      return typeof value === 'number' && authorHistory !== undefined && authorHistory.lastHourCount < value;
    // Only accepted posts are counted here, which is what `rateLimitChallengeSuccess: true` (the default) counts.
    case 'rateLimitChallengeSuccess':
      return value === true;
    default:
      return false;
  }
};

/**
 * Whether the board certainly skips this challenge for the post. Like pkc-js, an exclude item applies when
 * all its conditions match. Conditions this client cannot check, such as karma scores or other challenges'
 * results, never count as proven exemptions. Challenge-result dependencies are deferred separately below.
 */
const isExcludedForPost = (challenge: unknown, context: PrecheckPublicationContext) => {
  const excludes = isRecord(challenge) && Array.isArray(challenge.exclude) ? challenge.exclude : [];
  return excludes.some((exclude) => {
    if (!isRecord(exclude)) return false;
    const conditions = Object.entries(exclude).filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0));
    if (conditions.length === 0) return false;
    return conditions.every(([key, value]) => meetsExcludeCondition(key, value, context));
  });
};

/** The board must run the other challenge before a whitelist/name-based exemption can be decided. */
const hasChallengeDependentExemption = (challenge: unknown, context: PrecheckPublicationContext, challengeCount: number) => {
  const excludes = isRecord(challenge) && Array.isArray(challenge.exclude) ? challenge.exclude : [];
  return excludes.some((exclude) => {
    if (!isRecord(exclude) || !Array.isArray(exclude.challenges) || exclude.challenges.length === 0) return false;
    if (!exclude.challenges.every((index) => Number.isInteger(index) && index >= 0 && index < challengeCount)) return false;
    // Exclude conditions are conjunctive. An exemption only for replies cannot exempt a post.
    if (exclude.publicationType !== undefined && !meetsExcludeCondition('publicationType', exclude.publicationType, context)) return false;
    if (Array.isArray(exclude.roles) && exclude.roles.length > 0 && context.authorRole !== undefined && !exclude.roles.includes(context.authorRole)) return false;
    return true;
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

  const isSkipped = (index: number) => !hasVerifiedExemptionCapability(challenges[index]) && isExcludedForPost(challenges[index], context);
  const passIndexes = challenges.flatMap((challenge, index) => (getPrecheckServerUrl(challenge) === serverUrl && !isSkipped(index) ? [index] : []));
  if (passIndexes.length === 0) return undefined;
  // Private whitelist membership and verified names cannot be established here. Let the board
  // check the publication instead of rejecting an author it would exempt; this grants no pass.
  if (passIndexes.some((index) => !hasVerifiedExemptionCapability(challenges[index]) && hasChallengeDependentExemption(challenges[index], context, challenges.length)))
    return undefined;

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
    ...(passIndexes.some((index) => hasVerifiedExemptionCapability(challenges[index])) ? { verifyExemptions: true } : {}),
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

/** A random v4 UUID; `crypto.randomUUID` is missing from Safari before 15.4. */
export const createUuid = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const createPrecheckSessionId = () => `precheck-${createUuid()}`;

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

/** The signed draft proves identity without granting a publish pass or sending media. */
export const fetchPrecheckExemption = async ({ serverUrl, payload }: { serverUrl: string; payload: string }): Promise<boolean> => {
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
  const { ok, status, body } = await postSignedSpamBlockerRequest({ url: `${serverUrl}/precheck/exemption`, body: bytes });
  if (!ok) throw new Error(`Could not verify posting exemptions (${status}). Try again.`);
  if (!isRecord(body) || typeof body.exempt !== 'boolean') throw new Error('The exemption check returned an invalid response.');
  return body.exempt;
};

/** AbortController works in the older WebViews supported by the upload flow. */
export const postSignedSpamBlockerRequest = async ({
  url,
  body,
}: {
  url: string;
  body: Uint8Array<ArrayBuffer>;
}): Promise<{ ok: boolean; status: number; body: unknown }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/cbor' },
      body,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, body: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
};
