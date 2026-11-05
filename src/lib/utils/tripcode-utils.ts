/**
 * 5chan tripcodes, without the crypto (see lib/tripcode-crypto.ts).
 *
 * The name field takes 4chan's syntax: `Name#password` for a tripcode, `Name##password` for a secure
 * tripcode, `Name#password##password` for both. The password never leaves the device. It derives an
 * ed25519 key, and the post's `author.displayName` carries the name plus a proof the key signed:
 *
 *   <name>#tc1[.<nonce>]:<kind><publicKey><signature>[:<kind><publicKey><signature>]
 *
 * kind is `n` (normal) or `s` (secure), at most one of each, normal first. publicKey (32 bytes) and
 * signature (64 bytes) are unpadded base64url, 43 and 86 characters. nonce (1-99) is present only when
 * the board's wordfilter would have rewritten the proof with the default nonce 0.
 *
 * The signature covers getTripcodeMessage: the name, the board's public key, the thread, the author's
 * timestamp and the post's text, link and gallery, so a proof cannot be moved to another post. Readers
 * show `!trip` / `!!trip` only when it verifies. displayName is used because it is the only free-form
 * field a pseudonymous board keeps when it re-signs a post under an alias key.
 */

export type TripcodeKind = 'normal' | 'secure';

export const TRIPCODE_KINDS: readonly TripcodeKind[] = ['normal', 'secure'];

export type TripcodeSecret = Partial<Record<TripcodeKind, string>>;

export interface ParsedTripcodeInput {
  /** The name as published, without the tripcode part. */
  name: string;
  /** The typed tripcode part, starting with `#`, kept so the name field can show it again. */
  tripcodeInput?: string;
  secret?: TripcodeSecret;
}

export interface TripcodeProofEntry {
  kind: TripcodeKind;
  publicKey: string;
  signature: string;
}

export interface ParsedTripcodeProof {
  /** The published name before the proof, untrimmed, exactly as signed. */
  name: string;
  nonce: number;
  entries: TripcodeProofEntry[];
}

export interface TripcodeSignedFields {
  communityPublicKey: string;
  parentCid?: string;
  postCid?: string;
  timestamp: number;
  title?: string;
  content?: string;
  link?: string;
  galleryUrls?: string[];
}

export const TRIPCODE_PROOF_VERSION = 'tc1';
export const TRIPCODE_MESSAGE_DOMAIN = '5chan-tripcode-v1';
export const MAX_TRIPCODE_NONCE = 99;

const KIND_CODES: Record<TripcodeKind, string> = { normal: 'n', secure: 's' };
const BASE64URL_PUBLIC_KEY_LENGTH = 43;
const BASE64URL_SIGNATURE_LENGTH = 86;
const PROOF_PATTERN = new RegExp(
  `#${TRIPCODE_PROOF_VERSION}(?:\\.([1-9][0-9]?))?((?::[ns][A-Za-z0-9_-]{${BASE64URL_PUBLIC_KEY_LENGTH + BASE64URL_SIGNATURE_LENGTH}}){1,2})$`,
);
const PROOF_ENTRY_PATTERN = new RegExp(`:([ns])([A-Za-z0-9_-]{${BASE64URL_PUBLIC_KEY_LENGTH}})([A-Za-z0-9_-]{${BASE64URL_SIGNATURE_LENGTH}})`, 'g');

/** 4chan's name field parsing: the name ends at the first `#`; `##` starts the secure tripcode. */
export const parseTripcodeInput = (value: string | undefined): ParsedTripcodeInput => {
  const input = value ?? '';
  const hashIndex = input.indexOf('#');
  if (hashIndex === -1) {
    return { name: input.trim() };
  }

  const name = input.slice(0, hashIndex).trim();
  const rest = input.slice(hashIndex + 1);
  let normal: string | undefined;
  let secure: string | undefined;
  if (rest.startsWith('#')) {
    secure = rest.slice(1);
  } else {
    const secureIndex = rest.indexOf('##');
    normal = secureIndex === -1 ? rest : rest.slice(0, secureIndex);
    secure = secureIndex === -1 ? undefined : rest.slice(secureIndex + 2);
  }

  const secret: TripcodeSecret = {};
  if (normal) secret.normal = normal;
  if (secure) secret.secure = secure;
  return {
    name,
    tripcodeInput: input.slice(hashIndex),
    ...(secret.normal || secret.secure ? { secret } : {}),
  };
};

export const parseTripcodeProof = (displayName: string | undefined): ParsedTripcodeProof | undefined => {
  // Every post's name is checked, and almost none carry a proof.
  if (!displayName?.includes(`#${TRIPCODE_PROOF_VERSION}`)) return undefined;
  const match = PROOF_PATTERN.exec(displayName);
  if (!match) return undefined;

  const entries: TripcodeProofEntry[] = [];
  for (const [, code, publicKey, signature] of match[2].matchAll(PROOF_ENTRY_PATTERN)) {
    entries.push({ kind: code === 'n' ? 'normal' : 'secure', publicKey, signature });
  }
  // One entry per kind, normal first, so each proof has a single encoding.
  if (entries.length === 2 && (entries[0].kind !== 'normal' || entries[1].kind !== 'secure')) {
    return undefined;
  }

  return { name: displayName.slice(0, match.index), nonce: match[1] ? Number(match[1]) : 0, entries };
};

/** The name a reader shows, with any tripcode proof removed whether or not it verifies. */
export const stripTripcodeProof = (displayName: string | undefined): string | undefined => {
  const proof = parseTripcodeProof(displayName);
  return proof ? proof.name : displayName;
};

export const hasTripcodeProof = (displayName: string | undefined): boolean => !!parseTripcodeProof(displayName);

export const encodeTripcodeDisplayName = (name: string, nonce: number, entries: TripcodeProofEntry[]): string =>
  `${name}#${TRIPCODE_PROOF_VERSION}${nonce > 0 ? `.${nonce}` : ''}${entries.map(({ kind, publicKey, signature }) => `:${KIND_CODES[kind]}${publicKey}${signature}`).join('')}`;

/** The exact text each tripcode key signs. A JSON array keeps every field's boundaries unambiguous. */
export const getTripcodeMessage = (kind: TripcodeKind, nonce: number, name: string, fields: TripcodeSignedFields): string =>
  JSON.stringify([
    TRIPCODE_MESSAGE_DOMAIN,
    kind,
    nonce,
    name,
    fields.communityPublicKey,
    fields.parentCid ?? '',
    fields.parentCid ? (fields.postCid ?? '') : '',
    fields.timestamp,
    fields.title ?? '',
    fields.content ?? '',
    fields.link ?? '',
    fields.galleryUrls ?? [],
  ]);

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const getString = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

export interface TripcodeCommentSource {
  displayName?: string;
  communityAddress?: string;
  fields: Omit<TripcodeSignedFields, 'communityPublicKey'> & { communityPublicKey?: string };
}

/**
 * What a proof must have been signed over for a reader to show its trip. The text is the text on screen,
 * which an author edit replaces: a proof covers neither the key that published the comment nor its edits,
 * so anyone who republishes a tripcode post verbatim within the board's five minute timestamp window could
 * otherwise edit their copy and show any text under that trip. An edited post therefore loses its trip.
 * The other fields come from the comment's signed record when it has one; a local pending comment has no
 * record yet and is read from its own fields.
 */
export const getTripcodeCommentSource = (comment: unknown): TripcodeCommentSource | undefined => {
  if (!isRecord(comment)) return undefined;
  const raw = isRecord(comment.raw) && isRecord(comment.raw.comment) ? comment.raw.comment : undefined;
  const source = raw ?? comment;
  const author = isRecord(source.author) ? source.author : isRecord(comment.author) ? comment.author : undefined;
  const timestamp = typeof source.timestamp === 'number' ? source.timestamp : undefined;
  if (timestamp === undefined) return undefined;

  const parentCid = getString(source.parentCid);
  const gallery = Array.isArray(source.gallery) ? source.gallery : undefined;
  return {
    displayName: getString(author?.displayName),
    communityAddress: getString(comment.communityAddress) ?? getString(source.communityAddress),
    fields: {
      communityPublicKey: getString(source.communityPublicKey),
      parentCid,
      postCid: parentCid ? getString(source.postCid) : undefined,
      timestamp,
      title: getString(comment.title),
      content: getString(comment.content),
      link: getString(comment.link),
      galleryUrls: gallery?.map((item) => (isRecord(item) ? getString(item.url) : undefined)).filter((url): url is string => !!url),
    },
  };
};
