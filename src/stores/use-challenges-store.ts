import { create } from 'zustand';
import { Challenge } from '@bitsocial/bitsocial-react-hooks';

let nextChallengeId = 0;

type QueuedChallenge = { challenge: Challenge; id: number; onAbandon?: () => Promise<void> | void; stopFollowingPublication?: () => void };

interface State {
  challenges: QueuedChallenge[];
  addChallenge: (challenge: Challenge, onAbandon?: () => Promise<void> | void) => void;
  removeChallenge: () => void;
  abandonCurrentChallenge: () => Promise<void>;
}

/** The pkc-js publication a challenge was emitted for: onChallenge passes the challenge message, then the publication. */
type ChallengePublication = {
  state?: unknown;
  on: (event: 'statechange', listener: () => void) => unknown;
  removeListener: (event: 'statechange', listener: () => void) => unknown;
};

const getChallengePublication = (challenge: Challenge): ChallengePublication | undefined => {
  const publication: unknown = Array.isArray(challenge) ? challenge[1] : undefined;
  if (!publication || typeof publication !== 'object') return undefined;
  const { on, removeListener } = publication as Partial<ChallengePublication>;
  return typeof on === 'function' && typeof removeListener === 'function' ? (publication as ChallengePublication) : undefined;
};

// A pkc-js publication is "publishing" for its whole challenge exchange and leaves that state, with a statechange
// event, once a verdict, a failure or stop() ends it; an error pkc-js recovers from leaves it publishing. An answer
// to a challenge of an ended exchange reaches nobody (ERR_PUBLICATION_CHALLENGE_EXCHANGE_ENDED).
const hasExchangeEnded = (publication: ChallengePublication) => typeof publication.state === 'string' && publication.state !== 'publishing';

const useChallengesStore = create<State>((set, get) => {
  const dropChallenge = (id: number) => {
    const queuedChallenge = get().challenges.find((challenge) => challenge.id === id);
    if (!queuedChallenge) return;
    queuedChallenge.stopFollowingPublication?.();
    set((state) => ({ challenges: state.challenges.filter((challenge) => challenge.id !== id) }));
  };

  return {
    challenges: [],
    addChallenge: (challenge: Challenge, onAbandon?: () => Promise<void> | void) => {
      const publication = getChallengePublication(challenge);
      if (publication && hasExchangeEnded(publication)) return;

      const id = nextChallengeId++;
      let stopFollowingPublication: (() => void) | undefined;
      if (publication) {
        // Not abandoned: the publication's own callbacks report how it ended.
        const onStateChange = () => {
          if (hasExchangeEnded(publication)) dropChallenge(id);
        };
        publication.on('statechange', onStateChange);
        stopFollowingPublication = () => publication.removeListener('statechange', onStateChange);
      }
      set((state) => ({
        challenges: [...state.challenges, { challenge, id, onAbandon, stopFollowingPublication }],
      }));
    },
    removeChallenge: () => {
      const currentChallenge = get().challenges[0];
      if (currentChallenge) dropChallenge(currentChallenge.id);
    },
    abandonCurrentChallenge: async () => {
      const currentChallenge = get().challenges[0];
      get().removeChallenge();
      try {
        await currentChallenge?.onAbandon?.();
      } catch (error) {
        console.error('Failed to abandon challenge publication:', error);
      }
    },
  };
});

export default useChallengesStore;
