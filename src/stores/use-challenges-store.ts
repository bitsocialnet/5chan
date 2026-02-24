import { create } from 'zustand';
import { Challenge } from '@plebbit/plebbit-react-hooks';

let nextChallengeId = 0;

interface State {
  challenges: Array<{ challenge: Challenge; id: number }>;
  addChallenge: (challenge: Challenge) => void;
  removeChallenge: () => void;
}

const useChallengesStore = create<State>((set) => ({
  challenges: [],
  addChallenge: (challenge: Challenge) => {
    set((state) => ({
      challenges: [...state.challenges, { challenge, id: nextChallengeId++ }],
    }));
  },
  removeChallenge: () => {
    set((state) => {
      const challenges = [...state.challenges];
      challenges.shift();
      return { challenges };
    });
  },
}));

export default useChallengesStore;
