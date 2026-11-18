import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePostingAnonymityConfirm, { getBoardAnonymity } from '../use-posting-anonymity-confirm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void) => void }).act as (cb: () => void) => void;

const testState = vi.hoisted(() => ({
  community: undefined as { updatedAt?: number; features?: { pseudonymityMode?: string } } | undefined,
  directory: undefined as { features?: { pseudonymityMode?: string } } | undefined,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../use-directories', () => ({ useDirectoryByAddress: () => testState.directory }));
vi.mock('../use-stable-community', () => ({
  useCommunityField: (_address: string | undefined, selector: (community: unknown) => unknown) => (testState.community ? selector(testState.community) : undefined),
}));

describe('getBoardAnonymity', () => {
  it.each([
    [{ isBoardLoaded: true, livePseudonymityMode: 'per-post', directoryPseudonymityMode: undefined }, 'anonymous'],
    [{ isBoardLoaded: true, livePseudonymityMode: 'per-reply', directoryPseudonymityMode: undefined }, 'anonymous'],
    [{ isBoardLoaded: true, livePseudonymityMode: undefined, directoryPseudonymityMode: undefined }, 'not-anonymous'],
    [{ isBoardLoaded: true, livePseudonymityMode: 'none', directoryPseudonymityMode: undefined }, 'not-anonymous'],
    // A directory entry written while the board still anonymized must not outvote the board's settings.
    [{ isBoardLoaded: true, livePseudonymityMode: undefined, directoryPseudonymityMode: 'per-reply' }, 'not-anonymous'],
    [{ isBoardLoaded: false, livePseudonymityMode: undefined, directoryPseudonymityMode: 'per-reply' }, 'anonymous'],
    [{ isBoardLoaded: false, livePseudonymityMode: undefined, directoryPseudonymityMode: undefined }, 'unknown'],
  ] as const)('%o is %s', (input, expected) => {
    expect(getBoardAnonymity(input)).toBe(expected);
  });
});

describe('usePostingAnonymityConfirm', () => {
  let root: Root;
  let container: HTMLDivElement;
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  let confirmPostingAnonymity: () => boolean;

  const Probe = ({ communityAddress }: { communityAddress?: string }) => {
    confirmPostingAnonymity = usePostingAnonymityConfirm(communityAddress);
    return null;
  };

  const render = (communityAddress: string | undefined = 'board.bso') => act(() => root.render(<Probe communityAddress={communityAddress} />));

  beforeEach(() => {
    testState.community = undefined;
    testState.directory = undefined;
    confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    confirmSpy.mockRestore();
  });

  it('lets a post through without asking on a board that anonymizes posters', () => {
    testState.community = { updatedAt: 1, features: { pseudonymityMode: 'per-reply' } };
    render();

    expect(confirmPostingAnonymity()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks before posting on a board that publishes the identifier, and stops when declined', () => {
    testState.community = { updatedAt: 1, features: {} };
    render();

    expect(confirmPostingAnonymity()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith('post_not_anonymous_confirm');

    confirmSpy.mockImplementation(() => true);
    expect(confirmPostingAnonymity()).toBe(true);
  });

  it('says it cannot tell yet while an unlisted board is still loading', () => {
    render();

    expect(confirmPostingAnonymity()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith('post_anonymity_unknown_confirm');
  });

  it('trusts the directory entry while a listed board is still loading', () => {
    testState.directory = { features: { pseudonymityMode: 'per-post' } };
    render();

    expect(confirmPostingAnonymity()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('leaves a form with no board chosen to its own validation', () => {
    render('');

    expect(confirmPostingAnonymity()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
