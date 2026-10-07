import isEqual from 'lodash/isEqual';
import {
  BOARD_DEFAULT_FAIL_CHALLENGES,
  BOARD_DEFAULT_FEATURES,
  BOARD_DEFAULT_SETTINGS,
  BOARD_DEFAULT_SPAM_BLOCKER_CHALLENGES,
  MOD_ROLES_EXCLUDE,
  SPAM_BLOCKER_CHALLENGE_NAME,
} from '../../data/board-defaults';

// Fields pkc-js accepts in a community edit (CommunityEditOptionsSchema). `settings` holds private node
// settings such as challenges and is only readable and editable on the node that hosts the board.
const PUBLIC_EDITABLE_BOARD_KEYS = ['title', 'description', 'address', 'rules', 'roles', 'features', 'suggested', 'flairs'] as const;

export const getEditableBoardKeys = (isHostedOnConnectedNode: boolean): string[] =>
  isHostedOnConnectedNode ? [...PUBLIC_EDITABLE_BOARD_KEYS, 'settings'] : [...PUBLIC_EDITABLE_BOARD_KEYS];

export type EditableBoardSettings = Record<string, unknown>;

export const getEditableBoardSettings = (community: Record<string, unknown> | undefined, editableKeys: readonly string[]): EditableBoardSettings => {
  const editable: EditableBoardSettings = {};
  if (!community) {
    return editable;
  }
  for (const key of editableKeys) {
    if (community[key] !== undefined) {
      editable[key] = community[key];
    }
  }
  return editable;
};

export type BoardSettingsEditResult =
  | { ok: true; edit: EditableBoardSettings }
  | { ok: false; error: 'invalid_json' }
  | { ok: false; error: 'not_object' }
  | { ok: false; error: 'unknown_field'; field: string }
  | { ok: false; error: 'remote_removal'; field: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// Returns the first path where `after` drops something `before` had: a shorter array, a missing key, or null.
const findRemovedPath = (before: unknown, after: unknown, path: string): string | undefined => {
  if (Array.isArray(before) && Array.isArray(after)) {
    if (after.length < before.length) {
      return path;
    }
    for (const [index, item] of before.entries()) {
      const removedPath = findRemovedPath(item, after[index], `${path}[${index}]`);
      if (removedPath) return removedPath;
    }
    return undefined;
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    for (const [key, value] of Object.entries(before)) {
      if (!(key in after) || after[key] === null) {
        return `${path}.${key}`;
      }
      const removedPath = findRemovedPath(value, after[key], `${path}.${key}`);
      if (removedPath) return removedPath;
    }
  }
  return undefined;
};

/**
 * Returns only the fields that changed, so an admin's edit never carries owner-only fields
 * (roles, address) it did not touch. Top-level fields missing from the JSON are left unchanged.
 * The hosting node replaces each edited field, so removals work there. A remote node instead
 * deep-merges the edit into its current settings after pkc-js strips null and undefined values, so
 * a removed key, role, or array item would silently survive; those edits are rejected up front.
 */
export const getBoardSettingsEdit = (
  baseline: EditableBoardSettings,
  text: string,
  editableKeys: readonly string[],
  isHostedOnConnectedNode: boolean,
): BoardSettingsEditResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'not_object' };
  }
  const editableKeySet = new Set(editableKeys);
  const unknownField = Object.keys(parsed).find((key) => !editableKeySet.has(key));
  if (unknownField) {
    return { ok: false, error: 'unknown_field', field: unknownField };
  }

  const edit: EditableBoardSettings = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isEqual(value, baseline[key])) {
      continue;
    }
    const removedPath = isHostedOnConnectedNode ? undefined : findRemovedPath(baseline[key], value, key);
    if (removedPath) {
      return { ok: false, error: 'remote_removal', field: removedPath };
    }
    edit[key] = value;
  }
  return { ok: true, edit };
};

export interface CreateBoardFormValues {
  title: string;
  description: string;
  rules: string;
  moderators: string;
  challengeName: string;
  challengeOptions: Record<string, string>;
  useBoardDefaults: boolean;
}

const getNonEmptyLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const getNonEmptyOptions = (options: Record<string, string>) => {
  const nonEmptyOptions: Record<string, string> = {};
  for (const [option, value] of Object.entries(options)) {
    if (value.trim()) {
      nonEmptyOptions[option] = value.trim();
    }
  }
  return Object.keys(nonEmptyOptions).length > 0 ? nonEmptyOptions : undefined;
};

const getSelectedChallenges = ({ challengeName, challengeOptions, useBoardDefaults }: CreateBoardFormValues) => {
  if (!challengeName) {
    return [];
  }
  const options = getNonEmptyOptions(challengeOptions);
  if (challengeName === SPAM_BLOCKER_CHALLENGE_NAME && useBoardDefaults) {
    return BOARD_DEFAULT_SPAM_BLOCKER_CHALLENGES.map((challenge) => (options ? { ...challenge, options } : challenge));
  }
  return [{ name: challengeName, ...(options ? { options } : {}), exclude: [MOD_ROLES_EXCLUDE] }];
};

/** Builds the pkc-js createCommunity options for a board created from the app. */
export const buildCreateBoardOptions = (form: CreateBoardFormValues, ownerAddress: string | undefined): Record<string, unknown> => {
  const title = form.title.trim();
  const description = form.description.trim();
  const rules = getNonEmptyLines(form.rules);

  const roles: Record<string, { role: string }> = {};
  for (const address of getNonEmptyLines(form.moderators)) {
    roles[address] = { role: 'moderator' };
  }
  if (ownerAddress) {
    roles[ownerAddress] = { role: 'owner' };
  }

  // Always set challenges: without them pkc-js installs a question challenge with a random answer,
  // so nobody but the owner could post. An empty list leaves the board open.
  const challenges = [...(form.useBoardDefaults ? BOARD_DEFAULT_FAIL_CHALLENGES : []), ...getSelectedChallenges(form)];

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(rules.length > 0 ? { rules } : {}),
    ...(Object.keys(roles).length > 0 ? { roles } : {}),
    ...(form.useBoardDefaults ? { features: BOARD_DEFAULT_FEATURES } : {}),
    settings: { ...(form.useBoardDefaults ? BOARD_DEFAULT_SETTINGS : {}), challenges },
  };
};
