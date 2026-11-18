import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePostingAnonymityConfirm, { getBoardAnonymity, isPseudonymityExempt } from '../use-posting-anonymity-confirm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void) => void }).act as (cb: () => void) => void;

const testState = vi.hoisted(() => ({
  community: undefined as { updatedAt?: number; features?: { pseudonymityMode?: string }; roles?: Record<string, { role?: string }> } | undefined,
  account: { author: { address: '12D3KooWAuthor' }, signer: { address: '12D3KooWAuthor' } } as {
    author?: { address?: string };
    signer?: { address?: string };
    communities?: Record<string, { role?: { role?: string } }>;
  },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@bitsocial/bitsocial-react-hooks', () => ({ useAccount: () => testState.account }));
vi.mock('../use-stable-community', () => ({ getCurrentCommunity: () => testState.community }));

describe('getBoardAnonymity', () => {
  it.each([
    [{ isBoardLoaded: true, livePseudonymityMode: 'per-post' }, 'anonymous'],
    [{ isBoardLoaded: true, livePseudonymityMode: 'per-reply' }, 'anonymous'],
    [{ isBoardLoaded: true, livePseudonymityMode: undefined }, 'not-anonymous'],
    [{ isBoardLoaded: true, livePseudonymityMode: 'none' }, 'not-anonymous'],
    [{ isBoardLoaded: false, livePseudonymityMode: undefined }, 'unknown'],
  ] as const)('%o is %s', (input, expected) => {
    expect(getBoardAnonymity(input)).toBe(expected);
  });
});

describe('isPseudonymityExempt', () => {
  it.each(['owner', 'admin', 'moderator'])('exempts a %s', (role) => {
    expect(isPseudonymityExempt({ '12D3KooWKey': { role } }, ['12D3KooWKey'])).toBe(true);
  });

  it('matches a role keyed by the name the author posts under as well as by the key', () => {
    expect(isPseudonymityExempt({ 'mod.bso': { role: 'moderator' } }, ['mod.bso', '12D3KooWKey'])).toBe(true);
  });

  it('does not exempt other roles, other authors or a device without addresses', () => {
    expect(isPseudonymityExempt({ '12D3KooWKey': { role: 'member' } }, ['12D3KooWKey'])).toBe(false);
    expect(isPseudonymityExempt({ '12D3KooWOther': { role: 'owner' } }, ['12D3KooWKey'])).toBe(false);
    expect(isPseudonymityExempt({ undefined: { role: 'owner' } }, [undefined])).toBe(false);
    expect(isPseudonymityExempt(undefined, ['12D3KooWKey'])).toBe(false);
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
    testState.account = { author: { address: '12D3KooWAuthor' }, signer: { address: '12D3KooWAuthor' } };
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

  it('says it cannot tell yet while the board is still loading, even a board listed in a directory', () => {
    // A directory entry can predate the board turning anonymity off, so it never stands in for the settings.
    render();

    expect(confirmPostingAnonymity()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith('post_anonymity_unknown_confirm');
  });

  it("asks the board's staff on a board that anonymizes everyone else", () => {
    testState.community = { updatedAt: 1, features: { pseudonymityMode: 'per-post' }, roles: { '12D3KooWAuthor': { role: 'moderator' } } };
    render();

    expect(confirmPostingAnonymity()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith('post_as_board_staff_confirm');
  });

  it('names staff as the reason while the board has not loaded, from the role saved with the device data', () => {
    // Saved under the board's .eth alias, which is the same board as board.bso.
    testState.account = { ...testState.account, communities: { 'board.eth': { role: { role: 'owner' } } } };
    render();

    expect(confirmPostingAnonymity()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith('post_as_board_staff_confirm');
  });

  it("trusts the loaded board's roles over a saved role it has since removed", () => {
    testState.community = { updatedAt: 1, features: { pseudonymityMode: 'per-reply' }, roles: {} };
    testState.account = { ...testState.account, communities: { 'board.bso': { role: { role: 'moderator' } } } };
    render();

    expect(confirmPostingAnonymity()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('decides from the board as it is when called, not when the form rendered', () => {
    // A submit awaits its media checks before asking; the board can finish loading in the meantime.
    render();
    testState.community = { updatedAt: 1, features: { pseudonymityMode: 'per-reply' } };

    expect(confirmPostingAnonymity()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('leaves a form with no board chosen to its own validation', () => {
    render('');

    expect(confirmPostingAnonymity()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
