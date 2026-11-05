import { ed25519 } from '@noble/curves/ed25519.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  MAX_TRIPCODE_NONCE,
  TRIPCODE_KINDS,
  TRIPCODE_MESSAGE_DOMAIN,
  encodeTripcodeDisplayName,
  getTripcodeMessage,
  type ParsedTripcodeProof,
  type TripcodeKind,
  type TripcodeProofEntry,
  type TripcodeSecret,
  type TripcodeSignedFields,
} from './utils/tripcode-utils';

// Loaded on demand, so the key derivation and signature code stay out of the board's startup bundle. It
// imports nothing the startup bundle also loads but the tripcode utils: anything else shared, such as the
// hooks' wordfilters, comes from the caller, or the bundler splits the startup chunks around it.

/** The account's publish-time wordfilter: bitsocial-react-hooks' applyCommunityWordfilters. */
export type ApplyWordfilters = <T extends Record<string, any>>(
  publicationType: string,
  publication: T,
  challenges?: Array<{ publicOptions?: Record<string, unknown> }>,
) => T;

/**
 * The password's key derivation. Both use scrypt's 32 MB memory cost; the secure tripcode repeats it four
 * times (p = 4) under its own salt, so its keys and trips never match a normal tripcode's. There is no
 * server secret as on 4chan, so a weak password can still be guessed offline; the cost only slows that.
 */
const KEY_DERIVATION: Record<TripcodeKind, { salt: string; N: number; r: number; p: number }> = {
  normal: { salt: `${TRIPCODE_MESSAGE_DOMAIN}:normal`, N: 2 ** 15, r: 8, p: 1 },
  secure: { salt: `${TRIPCODE_MESSAGE_DOMAIN}:secure`, N: 2 ** 15, r: 8, p: 4 },
};

// 4chan's tripcode alphabet, so trips look familiar.
const TRIP_ALPHABET = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const TRIP_LENGTH = 10;
const MAX_VERIFIED_TRIP_CACHE_SIZE = 2000;

interface TripcodeKey {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (character) => character.charCodeAt(0));
};

/** `!` or `!!` and 10 characters of the hash of the kind and the public key. */
export const getTripFromPublicKey = (kind: TripcodeKind, publicKey: Uint8Array): string => {
  const hash = sha256(concatBytes(utf8ToBytes(`${TRIPCODE_MESSAGE_DOMAIN}:${kind}:`), publicKey));
  let bits = 0;
  let bitCount = 0;
  let trip = '';
  for (const byte of hash) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 6 && trip.length < TRIP_LENGTH) {
      bitCount -= 6;
      trip += TRIP_ALPHABET[(bits >> bitCount) & 63];
    }
    bits &= (1 << bitCount) - 1;
    if (trip.length === TRIP_LENGTH) break;
  }
  return `${kind === 'secure' ? '!!' : '!'}${trip}`;
};

// Derived keys stay in memory for the session only, so posting again does not pay the derivation again.
const derivedKeys = new Map<string, Promise<TripcodeKey>>();

const deriveTripcodeKey = (kind: TripcodeKind, password: string): Promise<TripcodeKey> => {
  const cacheKey = `${kind}\u0000${password}`;
  let key = derivedKeys.get(cacheKey);
  if (!key) {
    const { salt, N, r, p } = KEY_DERIVATION[kind];
    key = scryptAsync(utf8ToBytes(password.normalize('NFC')), utf8ToBytes(salt), { N, r, p, dkLen: 32 }).then((secretKey) => ({
      secretKey,
      publicKey: ed25519.getPublicKey(secretKey),
    }));
    key.catch(() => derivedKeys.delete(cacheKey));
    derivedKeys.set(cacheKey, key);
  }
  return key;
};

export class TripcodeSigningError extends Error {
  constructor(readonly reason: 'board_not_loaded' | 'wordfilter') {
    super(`Could not sign the tripcode (${reason})`);
    this.name = 'TripcodeSigningError';
  }
}

interface CreateTripcodeDisplayNameOptions {
  name: string;
  secret: TripcodeSecret;
  fields: Omit<TripcodeSignedFields, 'communityPublicKey'> & { communityPublicKey?: string };
  /** The board's challenges, whose wordfilters the publish applies to the name, subject and comment. */
  challenges?: Parameters<ApplyWordfilters>[2];
  applyWordfilters?: ApplyWordfilters;
}

/**
 * The displayName to publish: the name and the proof, signed over the fields as the board's wordfilters
 * will leave them, since the publish applies those filters after this. When a filter would also rewrite
 * the proof, another nonce gives the proof different characters.
 */
export const createTripcodeDisplayName = async ({ name, secret, fields, challenges, applyWordfilters }: CreateTripcodeDisplayNameOptions): Promise<string> => {
  const { communityPublicKey } = fields;
  if (!communityPublicKey) throw new TripcodeSigningError('board_not_loaded');

  const kinds = TRIPCODE_KINDS.filter((kind) => secret[kind]);
  const keys = await Promise.all(kinds.map((kind) => deriveTripcodeKey(kind, secret[kind] as string)));
  const filter = <T extends Record<string, unknown>>(publication: T) => (applyWordfilters ? applyWordfilters('comment', publication, challenges) : publication);
  const filtered = filter({ content: fields.content, title: fields.title, author: { displayName: name } });
  const signedName: string = filtered.author.displayName ?? '';
  const signedFields: TripcodeSignedFields = { ...fields, communityPublicKey, content: filtered.content, title: filtered.title };

  for (let nonce = 0; nonce <= MAX_TRIPCODE_NONCE; nonce++) {
    const entries: TripcodeProofEntry[] = kinds.map((kind, index) => ({
      kind,
      publicKey: bytesToBase64Url(keys[index].publicKey),
      signature: bytesToBase64Url(ed25519.sign(utf8ToBytes(getTripcodeMessage(kind, nonce, signedName, signedFields)), keys[index].secretKey)),
    }));
    const displayName = encodeTripcodeDisplayName(signedName, nonce, entries);
    if (filter({ author: { displayName } }).author.displayName === displayName) {
      return displayName;
    }
  }
  throw new TripcodeSigningError('wordfilter');
};

interface TripcodePublishOptions {
  communityAddress?: string;
  parentCid?: string;
  postCid?: string;
  title?: string;
  content?: string;
  link?: string;
  gallery?: Array<{ url?: string }>;
  author?: { displayName?: string };
}

/**
 * The displayName and timestamp to publish a comment with, signed over its final publish options. The
 * timestamp is the author's own, set here so the proof can cover it: a board rejects one more than five
 * minutes off, which limits replaying a post's proof.
 */
export const createTripcodePublishOptions = async ({
  publishOptions,
  secret,
  community,
  applyWordfilters,
}: {
  publishOptions: TripcodePublishOptions;
  secret: TripcodeSecret;
  community: { publicKey?: unknown; challenges?: unknown } | undefined;
  applyWordfilters: ApplyWordfilters;
}): Promise<{ displayName: string; timestamp: number }> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const displayName = await createTripcodeDisplayName({
    name: publishOptions.author?.displayName ?? '',
    secret,
    applyWordfilters,
    challenges: Array.isArray(community?.challenges) ? community.challenges : undefined,
    fields: {
      communityPublicKey: typeof community?.publicKey === 'string' ? community.publicKey : undefined,
      parentCid: publishOptions.parentCid,
      postCid: publishOptions.parentCid ? publishOptions.postCid : undefined,
      timestamp,
      title: publishOptions.title,
      content: publishOptions.content,
      link: publishOptions.link,
      galleryUrls: publishOptions.gallery?.map((item) => item.url).filter((url): url is string => !!url),
    },
  });
  return { displayName, timestamp };
};

const verifiedTrips = new Map<string, string | null>();

/** The trips a proof shows (`!trip`, `!!trip` or `!trip!!trip`), or undefined when any signature fails. */
export const getVerifiedTrip = (proof: ParsedTripcodeProof, fields: TripcodeSignedFields): string | undefined => {
  const cacheKey = JSON.stringify([proof, fields]);
  const cached = verifiedTrips.get(cacheKey);
  if (cached !== undefined) return cached ?? undefined;

  let trip: string | null = '';
  for (const { kind, publicKey, signature } of proof.entries) {
    try {
      const publicKeyBytes = base64UrlToBytes(publicKey);
      const message = utf8ToBytes(getTripcodeMessage(kind, proof.nonce, proof.name, fields));
      if (!ed25519.verify(base64UrlToBytes(signature), message, publicKeyBytes)) {
        trip = null;
        break;
      }
      trip += getTripFromPublicKey(kind, publicKeyBytes);
    } catch {
      trip = null;
      break;
    }
  }

  if (verifiedTrips.size >= MAX_VERIFIED_TRIP_CACHE_SIZE) {
    verifiedTrips.delete(verifiedTrips.keys().next().value as string);
  }
  verifiedTrips.set(cacheKey, trip);
  return trip ?? undefined;
};
