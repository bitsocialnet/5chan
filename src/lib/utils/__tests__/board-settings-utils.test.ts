import { describe, expect, it } from 'vitest';
import { SPAM_BLOCKER_CHALLENGE_NAME } from '../../../data/board-defaults';
import { buildCreateBoardOptions, CreateBoardFormValues, getBoardSettingsEdit, getEditableBoardKeys, getEditableBoardSettings } from '../board-settings-utils';

const emptyForm: CreateBoardFormValues = {
  title: '',
  description: '',
  rules: [],
  moderators: [],
  challengeName: '',
  challengeOptions: {},
  useBoardDefaults: false,
};

type ChallengeSetting = { name: string; options?: Record<string, string>; exclude?: Record<string, unknown>[]; pendingApproval?: boolean };
const getChallenges = (options: Record<string, unknown>) => (options.settings as { challenges: ChallengeSetting[] }).challenges;

describe('getEditableBoardSettings', () => {
  it('includes private settings only for the node hosting the board', () => {
    const community = { title: 'Tech', settings: { fetchThumbnailUrls: true }, signature: { signature: 'x' }, posts: {}, updatedAt: 1 };

    expect(getEditableBoardSettings(community, getEditableBoardKeys(false))).toEqual({ title: 'Tech' });
    expect(getEditableBoardSettings(community, getEditableBoardKeys(true))).toEqual({ title: 'Tech', settings: { fetchThumbnailUrls: true } });
  });
});

describe('getBoardSettingsEdit', () => {
  const baseline = {
    title: 'Tech',
    rules: ['be nice', 'no spam'],
    roles: { owner: { role: 'owner' }, mod: { role: 'moderator' } },
    features: { noUpvotes: true },
  };
  const remoteKeys = getEditableBoardKeys(false);
  const hostedKeys = getEditableBoardKeys(true);

  it('returns only changed fields so an admin edit never carries untouched owner-only fields', () => {
    const text = JSON.stringify({ ...baseline, title: 'Technology' });

    expect(getBoardSettingsEdit(baseline, text, remoteKeys, false)).toEqual({ ok: true, edit: { title: 'Technology' } });
  });

  it('returns an empty edit when nothing changed', () => {
    expect(getBoardSettingsEdit(baseline, JSON.stringify(baseline, null, 2), remoteKeys, false)).toEqual({ ok: true, edit: {} });
  });

  it('allows additions on a remote board, which merges them into its current settings', () => {
    const text = JSON.stringify({ ...baseline, rules: ['be nice', 'no spam', 'no doxxing'], roles: { ...baseline.roles, newMod: { role: 'moderator' } } });

    expect(getBoardSettingsEdit(baseline, text, remoteKeys, false)).toEqual({
      ok: true,
      edit: { rules: ['be nice', 'no spam', 'no doxxing'], roles: { ...baseline.roles, newMod: { role: 'moderator' } } },
    });
  });

  it('rejects removals a remote merge would silently ignore, but sends them to the hosting node', () => {
    const removedRule = JSON.stringify({ ...baseline, rules: ['no spam'] });
    const removedRole = JSON.stringify({ ...baseline, roles: { owner: { role: 'owner' } } });
    const nulledFeature = JSON.stringify({ ...baseline, features: { noUpvotes: null } });
    const nulledTitle = JSON.stringify({ ...baseline, title: null });

    expect(getBoardSettingsEdit(baseline, removedRule, remoteKeys, false)).toEqual({ ok: false, error: 'remote_removal', field: 'rules' });
    expect(getBoardSettingsEdit(baseline, removedRole, remoteKeys, false)).toEqual({ ok: false, error: 'remote_removal', field: 'roles.mod' });
    expect(getBoardSettingsEdit(baseline, nulledFeature, remoteKeys, false)).toEqual({ ok: false, error: 'remote_removal', field: 'features.noUpvotes' });
    expect(getBoardSettingsEdit(baseline, nulledTitle, remoteKeys, false)).toEqual({ ok: false, error: 'remote_removal', field: 'title' });
    expect(getBoardSettingsEdit(baseline, removedRole, hostedKeys, true)).toEqual({ ok: true, edit: { roles: { owner: { role: 'owner' } } } });
  });

  it('rejects invalid JSON, non-object JSON, and fields that cannot be edited', () => {
    expect(getBoardSettingsEdit(baseline, '{', remoteKeys, false)).toEqual({ ok: false, error: 'invalid_json' });
    expect(getBoardSettingsEdit(baseline, '[]', remoteKeys, false)).toEqual({ ok: false, error: 'not_object' });
    expect(getBoardSettingsEdit(baseline, JSON.stringify({ settings: {} }), remoteKeys, false)).toEqual({ ok: false, error: 'unknown_field', field: 'settings' });
    expect(getBoardSettingsEdit(baseline, JSON.stringify({ settings: {} }), hostedKeys, true)).toEqual({ ok: true, edit: { settings: {} } });
  });
});

describe('buildCreateBoardOptions', () => {
  it('makes the creator the owner, keeps each staff role, and drops empty rules and moderators', () => {
    const options = buildCreateBoardOptions(
      {
        ...emptyForm,
        title: ' Tech ',
        rules: ['be nice', '  ', ' no spam '],
        moderators: [
          { address: ' mod1.bso ', role: 'moderator' },
          { address: 'admin1.bso', role: 'admin' },
          { address: '', role: 'moderator' },
          { address: 'creator.bso', role: 'admin' },
        ],
      },
      'creator.bso',
    );

    expect(options).toEqual({
      title: 'Tech',
      rules: ['be nice', 'no spam'],
      roles: { 'mod1.bso': { role: 'moderator' }, 'admin1.bso': { role: 'admin' }, 'creator.bso': { role: 'owner' } },
      settings: { challenges: [] },
    });
  });

  it('applies the 5chan defaults and the spam-blocker preset when both are selected', () => {
    const options = buildCreateBoardOptions({ ...emptyForm, useBoardDefaults: true, challengeName: SPAM_BLOCKER_CHALLENGE_NAME }, 'creator.bso');
    const challenges = getChallenges(options);

    expect(options.features).toMatchObject({ noUpvotes: true, noDownvotes: true, requirePostLinkIsMedia: true, pseudonymityMode: 'per-post' });
    expect(options.settings).toMatchObject({ fetchThumbnailUrls: true });
    expect(challenges.map((challenge) => challenge.name)).toEqual(['fail', 'fail', SPAM_BLOCKER_CHALLENGE_NAME, SPAM_BLOCKER_CHALLENGE_NAME]);
    expect(challenges.every((challenge) => challenge.exclude?.some((exclude) => Array.isArray(exclude.roles)))).toBe(true);
  });

  it('adds a single node challenge with its options and a moderator exclude when defaults are off', () => {
    const options = buildCreateBoardOptions(
      { ...emptyForm, challengeName: 'question', challengeOptions: { question: 'Password?', answer: ' hunter2 ', unused: ' ' } },
      undefined,
    );

    expect(options.features).toBeUndefined();
    expect(getChallenges(options)).toEqual([
      { name: 'question', options: { question: 'Password?', answer: 'hunter2' }, exclude: [{ roles: ['moderator', 'admin', 'owner'] }] },
    ]);
  });

  it('never uses the exclude.role field that pkc-js 0.0.101 rejects', () => {
    const options = buildCreateBoardOptions({ ...emptyForm, useBoardDefaults: true, challengeName: SPAM_BLOCKER_CHALLENGE_NAME }, 'creator.bso');

    expect(
      getChallenges(options)
        .flatMap((challenge) => challenge.exclude ?? [])
        .some((exclude) => 'role' in exclude),
    ).toBe(false);
  });
});
