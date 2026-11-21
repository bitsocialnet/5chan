import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChallengeModal from '../challenge-modal';
import useChallengesStore from '../../../stores/use-challenges-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => ({ author: { address: '0xabc123' } }),
  useComment: () => undefined,
}));

vi.mock('../../../hooks/use-is-mobile', () => ({
  default: () => false,
}));

vi.mock('../../../hooks/use-theme', () => ({
  default: () => ['dark'],
}));

vi.mock('@use-gesture/react', () => ({
  useDrag: () => () => ({}),
}));

// A pkc-js publication: "publishing" during its challenge exchange, "stopped" once it ended.
const createPublication = (content: string) =>
  Object.assign(new EventEmitter(), {
    communityAddress: 'music-posting.eth',
    content,
    publishChallengeAnswers: vi.fn().mockResolvedValue(undefined),
    state: 'publishing',
  });

const addChallengeFor = (publication: ReturnType<typeof createPublication>, onAbandon = vi.fn()) => {
  useChallengesStore.getState().addChallenge([{ type: 'CHALLENGE', challenges: { 0: { type: 'text/plain', challenge: '2 + 2' } } }, publication] as never, onAbandon);
  return onAbandon;
};

const endPublication = async (publication: ReturnType<typeof createPublication>) => {
  await act(async () => {
    publication.state = 'stopped';
    publication.emit('statechange', 'stopped');
  });
};

let container: HTMLDivElement;
let root: Root;

describe('ChallengeModal with a publication whose exchange ends', () => {
  beforeEach(() => {
    useChallengesStore.setState({ challenges: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('closes the challenge of a publication that stopped and shows the next queued one', async () => {
    const failedPublication = createPublication('failed post');
    const livePublication = createPublication('live post');
    const onAbandonFailed = addChallengeFor(failedPublication);
    addChallengeFor(livePublication);

    await act(async () => {
      root.render(createElement(ChallengeModal));
    });
    expect(container.querySelector('textarea')?.value).toBe('failed post');

    await endPublication(failedPublication);

    // The live publication's challenge is asked now; the stopped one is never answered or abandoned.
    expect(container.querySelector('textarea')?.value).toBe('live post');
    expect(failedPublication.publishChallengeAnswers).not.toHaveBeenCalled();
    expect(onAbandonFailed).not.toHaveBeenCalled();

    await endPublication(livePublication);
    expect(container.innerHTML).toBe('');
  });
});
