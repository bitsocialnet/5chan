import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type PublishOptions = Record<string, unknown> & {
  onChallenge?: (challenge: Record<string, unknown>, publication: Record<string, unknown>) => Promise<void>;
  onChallengeVerification?: (challengeVerification: Record<string, unknown>) => Promise<void>;
};

const testState = vi.hoisted(() => ({
  account: { author: { address: 'admin-address' } } as Record<string, unknown> | undefined,
  community: undefined as Record<string, unknown> | undefined,
  navigateMock: vi.fn(),
  publishOptions: [] as PublishOptions[],
  publishCommunityEditMock: vi.fn(),
  challengeVerification: { challengeSuccess: true } as Record<string, unknown>,
  respondWithChallenge: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.field ? `${key}:${options.field}` : options?.error ? `${key}:${options.error}` : key),
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => `navigate:${to}`,
  useNavigate: () => testState.navigateMock,
  useParams: () => ({ boardIdentifier: 'tech' }),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useCommunity: () => testState.community,
  usePublishCommunityEdit: (options: PublishOptions) => {
    testState.publishOptions.push(options);
    return {
      publishCommunityEdit: async () => {
        testState.publishCommunityEditMock(options);
        if (testState.respondWithChallenge) {
          await options.onChallenge?.({ challenges: [] }, { communityEdit: {} });
          return;
        }
        await options.onChallengeVerification?.(testState.challengeVerification);
      },
    };
  },
}));

vi.mock('../../../hooks/use-directories', () => ({ useDirectories: () => [] }));
vi.mock('../../../hooks/use-community-identifiers', () => ({ useCommunityIdentifier: (address?: string) => (address ? { name: address } : undefined) }));
vi.mock('../../../hooks/use-resolved-community-address', () => ({ useResolvedCommunityAddress: () => 'tech.bso' }));
vi.mock('../../../lib/utils/route-utils', () => ({ getBoardPath: () => 'tech' }));
vi.mock('../../../components/json-editor', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
      ReactModule.createElement('textarea', {
        'data-testid': 'json-editor',
        value,
        onChange: (event: Event) => onChange((event.target as HTMLTextAreaElement).value),
      }),
  };
});

let root: Root;
let container: HTMLDivElement;
let BoardSettings: React.ComponentType;

const remoteBoard = {
  title: 'Tech',
  rules: ['be nice'],
  roles: { 'owner-address': { role: 'owner' }, 'admin-address': { role: 'admin' }, 'mod-address': { role: 'moderator' } },
  updatedAt: 1,
  signature: { signature: 'sig' },
  syncState: 'succeeded',
  lastSuccessfulFetchAt: 2,
};

const getEditor = () => container.querySelector<HTMLTextAreaElement>('[data-testid="json-editor"]');

const render = async () => {
  await act(async () => {
    root.render(createElement(BoardSettings));
  });
};

const setEditorValue = async (value: string) => {
  const editor = getEditor();
  expect(editor).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(editor, value);
    editor?.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const clickButton = async (label: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === label);
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('BoardSettings', () => {
  beforeEach(async () => {
    vi.resetModules();
    testState.account = { author: { address: 'admin-address' } };
    testState.community = remoteBoard;
    testState.navigateMock.mockReset();
    testState.publishOptions = [];
    testState.publishCommunityEditMock.mockReset();
    testState.challengeVerification = { challengeSuccess: true };
    testState.respondWithChallenge = false;
    BoardSettings = (await import('../board-settings')).default;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the public board fields to an admin and publishes only the changed field', async () => {
    await render();

    expect(container.textContent).toContain('board_settings_remote_notice');
    expect(JSON.parse(getEditor()?.value ?? '')).toEqual({ title: 'Tech', rules: ['be nice'], roles: remoteBoard.roles });

    await setEditorValue(JSON.stringify({ ...JSON.parse(getEditor()?.value ?? ''), title: 'Technology' }));
    await clickButton('save_changes');

    expect(testState.publishCommunityEditMock).toHaveBeenCalledTimes(1);
    const options = testState.publishCommunityEditMock.mock.calls[0][0] as PublishOptions;
    expect(options.communityAddress).toBe('tech.bso');
    expect(options.title).toBe('Technology');
    expect(options).not.toHaveProperty('roles');
    expect(container.textContent).toContain('board_settings_saved');
  });

  it('includes private settings when the connected node hosts the board', async () => {
    testState.account = { author: { address: 'someone-else' } };
    testState.community = { ...remoteBoard, settings: { fetchThumbnailUrls: true } };
    await render();

    expect(container.textContent).toContain('board_settings_hosted_notice');
    expect(JSON.parse(getEditor()?.value ?? '')).toMatchObject({ settings: { fetchThumbnailUrls: true } });
  });

  it('sends moderators to the not-allowed page', async () => {
    testState.account = { author: { address: 'mod-address' } };
    await render();

    expect(container.textContent).toBe('navigate:/not-allowed');
  });

  it('waits for the board before deciding access', async () => {
    testState.community = undefined;
    await render();

    expect(container.textContent).not.toContain('navigate:');
    expect(getEditor()).toBeNull();
  });

  it('reports unknown fields, missing changes, and failed challenge verification without hiding the draft', async () => {
    await render();

    await clickButton('save_changes');
    expect(container.textContent).toContain('board_settings_no_changes');

    await setEditorValue(JSON.stringify({ title: 'Tech', settings: {} }));
    await clickButton('save_changes');
    expect(container.textContent).toContain('board_settings_unknown_field:settings');
    expect(testState.publishCommunityEditMock).not.toHaveBeenCalled();

    testState.challengeVerification = { challengeSuccess: false, reason: 'not allowed' };
    await setEditorValue(JSON.stringify({ title: 'New title' }));
    await clickButton('save_changes');
    expect(container.textContent).toContain('board_settings_save_failed:not allowed');
    expect(getEditor()?.value).toBe(JSON.stringify({ title: 'New title' }));
  });

  it('lets an owner on a board hosted elsewhere publish an edit', async () => {
    testState.account = { author: { address: 'owner-address' } };
    await render();

    expect(container.textContent).toContain('board_settings_remote_notice');
    await setEditorValue(JSON.stringify({ title: 'Technology' }));
    await clickButton('save_changes');

    expect(testState.publishCommunityEditMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('board_settings_saved');
  });

  it('diffs the draft against the settings it was started from, not a board update that arrived later', async () => {
    await render();
    await setEditorValue(JSON.stringify({ title: 'Technology', rules: ['be nice'] }));

    testState.community = { ...remoteBoard, rules: ['be nice', 'added by another admin'], updatedAt: 3 };
    await render();
    await clickButton('save_changes');

    const options = testState.publishCommunityEditMock.mock.calls[0][0] as PublishOptions;
    expect(options.title).toBe('Technology');
    expect(options).not.toHaveProperty('rules');
    expect(container.textContent).toContain('board_settings_saved');

    // The saved draft becomes the new starting point, so saving it again has nothing to send.
    await clickButton('save_changes');
    expect(container.textContent).toContain('board_settings_no_changes');
  });

  it('waits for a fresh fetch before denying access based on a cached board record', async () => {
    testState.account = { author: { address: 'mod-address' } };
    testState.community = { ...remoteBoard, syncState: 'loading', lastSuccessfulFetchAt: undefined };
    await render();

    expect(container.textContent).not.toContain('navigate:');

    testState.community = { ...remoteBoard, syncState: 'succeeded', lastSuccessfulFetchAt: 2 };
    await render();
    expect(container.textContent).toBe('navigate:/not-allowed');
  });

  it('stops loading when the board lookup fails without any board data', async () => {
    testState.community = { syncState: 'failed', state: 'failed' };
    await render();

    expect(container.textContent).toContain('community_offline_info');
    expect(container.textContent).not.toContain('navigate:');
  });

  it('rejects removals that a remote board would silently ignore', async () => {
    await render();

    await setEditorValue(JSON.stringify({ ...JSON.parse(getEditor()?.value ?? ''), rules: [] }));
    await clickButton('save_changes');

    expect(container.textContent).toContain('board_settings_remote_removal');
    expect(testState.publishCommunityEditMock).not.toHaveBeenCalled();
  });

  it('makes the form editable again when the user closes the challenge', async () => {
    testState.respondWithChallenge = true;
    const { default: useChallengesStore } = await import('../../../stores/use-challenges-store');
    await render();

    await setEditorValue(JSON.stringify({ title: 'New title' }));
    await clickButton('save_changes');
    expect(container.textContent).toContain('board_settings_saving');
    expect(useChallengesStore.getState().challenges).toHaveLength(1);

    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    expect(container.textContent).not.toContain('board_settings_saving');
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'save_changes');
    expect(saveButton?.disabled).toBe(false);
  });
});
