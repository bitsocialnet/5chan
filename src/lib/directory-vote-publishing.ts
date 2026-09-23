import { CommunitySchema, republishIntervalBuckets, type Criteria, type NameResolver, type PubsubVoter, type VoteSigner } from '@bitsocial/pubsub-voting';

export interface DirectoryVoteTarget {
  name?: string;
  publicKey: string;
}

export type DirectoryVotePublishResult = { status: 'published'; topic: string; blockNumber: number } | { status: 'ineligible'; error: string };

interface PublishDirectoryVoteOptions {
  voter: PubsubVoter;
  criteria: Criteria;
  signer: VoteSigner;
  address: string;
  /** The board to vote for; `undefined` publishes an empty ballot, which withdraws the vote. */
  community: DirectoryVoteTarget | undefined;
}

/**
 * Sign and broadcast one directory ballot. Eligibility is checked first because gossipsub gives
 * no acceptance feedback: a vote from a wallet without the Pass would look published and never count.
 */
export const publishDirectoryVote = async ({ voter, criteria, signer, address, community }: PublishDirectoryVoteOptions): Promise<DirectoryVotePublishResult> => {
  const contest = await voter.createContest({ criteria });
  if (community) {
    const eligibility = await contest.checkEligibility({ address });
    if (!eligibility.eligible) return { status: 'ineligible', error: eligibility.error };
  }

  const vote = await voter.createContestVote({ criteria, votes: community ? [{ community, vote: 1 }] : [], signer });
  const { bundle } = await vote.publish();
  return { status: 'published', topic: contest.topic, blockNumber: bundle.blockNumber };
};

const directoryVoteLocks = new Map<string, Promise<unknown>>();

/**
 * Run one ballot operation at a time per voting wallet and contest, so a background refresh can
 * never sign a stale choice after (or between) the user's own vote changes.
 */
export const withDirectoryVoteLock = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
  const previous = directoryVoteLocks.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const settled = result.catch(() => undefined);
  directoryVoteLocks.set(key, settled);
  void settled.then(() => {
    if (directoryVoteLocks.get(key) === settled) directoryVoteLocks.delete(key);
  });
  return result;
};

/** A vote expires `voteExpiryBuckets` after it was signed; re-sign it once half of that has passed. */
export const isDirectoryVoteRefreshDue = (criteria: Criteria, blockNumber: number, headBlock: number): boolean =>
  Math.floor(headBlock / criteria.blocksPerBucket) >= Math.floor(blockNumber / criteria.blocksPerBucket) + republishIntervalBuckets(criteria);

export type DirectoryBoardResolution = { status: 'resolved'; target: DirectoryVoteTarget } | { status: 'invalid' | 'not-found' };

/** Turn a typed board address (`name.bso`, `/name.bso/`, or a raw public key) into a vote target. */
export const resolveDirectoryBoard = async (input: string, nameResolvers: readonly NameResolver[] | undefined): Promise<DirectoryBoardResolution> => {
  const address = input.trim().replace(/^\/+|\/+$/g, '');
  if (!address) return { status: 'invalid' };

  if (!address.includes('.')) {
    return CommunitySchema.safeParse({ publicKey: address }).success ? { status: 'resolved', target: { publicKey: address } } : { status: 'invalid' };
  }

  const name = address.toLowerCase();
  const resolver = nameResolvers?.find((candidate) => candidate.canResolve({ name }));
  if (!resolver) return { status: 'invalid' };

  const record = await resolver.resolve({ name });
  if (!record?.publicKey) return { status: 'not-found' };

  const target = { name, publicKey: record.publicKey };
  return CommunitySchema.safeParse(target).success ? { status: 'resolved', target } : { status: 'invalid' };
};
