import type { Community } from '@bitsocial/bitsocial-react-hooks';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { getBoardNoBumpKeywords } from './board-sort-utils';

export const POST_OPTIONS_VALIDATION_DELAY_MS = 700;
export const SAGE_FAQ_LINK_LABEL = 'learn why';
export const SAGE_FAQ_PATH = '/faq#sage';
const SAGE_OPTION = 'sage';
const NONOKOSAGE_OPTION = 'nonokosage';
const FORTUNE_DIRECTORY_CODES = new Set(['b', 's5s']);
const DICE_DIRECTORY_CODES = new Set(['qst', 'tg']);
const POST_OPTION_ROUTE_DIRECTORY_CODES = new Set([...FORTUNE_DIRECTORY_CODES, ...DICE_DIRECTORY_CODES]);
const MAX_DICE_COUNT = 25;

export interface FortuneEntry {
  color: string;
  text: string;
}

export interface DiceRoll {
  count: number;
  sides: number;
  rolls: number[];
  modifier: number;
  modifierText: string;
  total: number;
}

export interface PostOptionsValidationError {
  unsupportedOptions: string[];
  supportedDirectoryCodesByOption: Array<{ option: string; directoryCodes: string[] }>;
}

export const isPostOptionsValidationError = (error: unknown): error is PostOptionsValidationError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const value = error as Partial<PostOptionsValidationError>;
  return Array.isArray(value.unsupportedOptions) && Array.isArray(value.supportedDirectoryCodesByOption);
};

interface PostOptionsDirectory {
  directoryCode?: string;
  title?: string;
}

const getRouteDirectoryCode = (pathname: string | undefined): string | undefined => {
  const firstSegment = pathname?.split('/').filter(Boolean)[0];
  return firstSegment && POST_OPTION_ROUTE_DIRECTORY_CODES.has(firstSegment) ? firstSegment : undefined;
};

const FORTUNE_ENTRIES: readonly FortuneEntry[] = [
  { text: 'Bad Luck', color: '#7fec11' },
  { text: 'Average Luck', color: '#bac200' },
  { text: 'Good Luck', color: '#e7890c' },
  { text: 'Excellent Luck', color: '#fd4d32' },
  { text: 'Reply hazy, try again', color: '#f51c6a' },
  { text: 'Godly Luck', color: '#d302a7' },
  { text: 'Very Bad Luck', color: '#9d05da' },
  { text: 'Outlook good', color: '#6023f8' },
  { text: 'Better not tell you now', color: '#2a56fb' },
  { text: 'You will meet a dark handsome stranger', color: '#0893e1' },
  { text: 'ｷﾀ━━━━━━(ﾟ∀ﾟ)━━━━━━ !!!!', color: '#00cbb0' },
  { text: '（　´_ゝ`）ﾌｰﾝ ', color: '#16f174' },
  { text: 'Good news will come to you by mail', color: '#43fd3b' },
];

const parsePostOptions = (value: string): string[] => value.trim().split(/\s+/).filter(Boolean);

interface DiceSpec {
  count: number;
  sides: number;
  modifier: number;
  modifierText: string;
}

const getDiceSpec = (rawCount: string, rawSides: string, sign: string | undefined, rawModifier: string | undefined): DiceSpec | null => {
  const count = Number(rawCount);
  const sides = Number(rawSides);
  const modifierValue = rawModifier ? Number(rawModifier) : 0;
  // Safe integers keep the published `[dice=…]` marker exact; a larger number would print as 1e+21.
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(sides) || !Number.isSafeInteger(modifierValue) || count < 1 || sides < 1) {
    return null;
  }

  return {
    count: Math.min(MAX_DICE_COUNT, count),
    sides,
    modifier: sign === '-' ? -modifierValue : modifierValue,
    modifierText: sign ? ` ${sign} ${modifierValue}` : '',
  };
};

const parseDiceOption = (option: string): DiceSpec | null => {
  const match = option.match(/^dice\+(\d+)d(\d+)(?:([+-])(\d+))?$/);
  return match ? getDiceSpec(match[1], match[2], match[3], match[4]) : null;
};

export const getPostOptionsDirectoryCode = (directory: PostOptionsDirectory | null | undefined, pathname?: string): string | undefined => {
  if (directory?.directoryCode) {
    return directory.directoryCode;
  }
  return directory?.title?.match(/^\/([^/]+)\//)?.[1] ?? getRouteDirectoryCode(pathname);
};

/** `nonokosage` is 4chan's shorthand for `nonoko` plus `sage`. */
export const isSageOption = (option: string): boolean => option === SAGE_OPTION || option === NONOKOSAGE_OPTION;

/** Sage needs the board's bump order to skip replies carrying the `sage` keyword; see appendSageMarker. */
export const isSageSupportedByBoard = (community: Community | undefined): boolean => getBoardNoBumpKeywords(community).includes(SAGE_OPTION);

const isSupportedPostOption = (option: string, directoryCode: string | undefined, isSageSupported: boolean): boolean => {
  if (option === 'nonoko') {
    return true;
  }

  if (isSageOption(option)) {
    return isSageSupported;
  }

  if (option === 'fortune') {
    return isFortuneDirectoryCode(directoryCode);
  }

  return !!parseDiceOption(option) && isDiceDirectoryCode(directoryCode);
};

const getSupportedDirectoryCodes = (option: string): string[] => {
  if (option === 'fortune') {
    return [...FORTUNE_DIRECTORY_CODES];
  }

  return parseDiceOption(option) ? [...DICE_DIRECTORY_CODES] : [];
};

export const getPostOptionsValidationError = (value: string, directoryCode: string | undefined, isSageSupported = false): PostOptionsValidationError | null => {
  let hasDiceOption = false;
  const unsupportedOptions: string[] = [];
  const supportedDirectoryCodesByOption: Array<{ option: string; directoryCodes: string[] }> = [];

  for (const option of parsePostOptions(value)) {
    const diceOption = parseDiceOption(option);
    if (diceOption && isDiceDirectoryCode(directoryCode)) {
      const isExtraDiceOption = hasDiceOption;
      hasDiceOption = true;
      if (isExtraDiceOption) {
        unsupportedOptions.push(option);
      }
      continue;
    }

    if (isSupportedPostOption(option, directoryCode, isSageSupported)) {
      continue;
    }

    const optionDirectoryCodes = getSupportedDirectoryCodes(option);
    if (optionDirectoryCodes.length > 0) {
      unsupportedOptions.push(option);
      if (!supportedDirectoryCodesByOption.some((entry) => entry.option === option)) {
        supportedDirectoryCodesByOption.push({ option, directoryCodes: optionDirectoryCodes });
      }
    } else {
      unsupportedOptions.push(option);
    }
  }

  return unsupportedOptions.length > 0 ? { unsupportedOptions, supportedDirectoryCodesByOption } : null;
};

export const getUnsupportedPostOptionsMessage = (value: string, directoryCode: string | undefined, isSageSupported = false): string | null => {
  const error = getPostOptionsValidationError(value, directoryCode, isSageSupported);
  if (!error) {
    return null;
  }

  const unsupportedOptionsLabel = error.unsupportedOptions.map((option) => (isSageOption(option) ? `${option} [${SAGE_FAQ_LINK_LABEL}]` : option)).join(', ');
  let message = `Unsupported options: ${unsupportedOptionsLabel}.`;

  for (const { option, directoryCodes } of error.supportedDirectoryCodesByOption) {
    message += ` Option "${option}" is supported on: ${directoryCodes.map((code) => `/${code}/`).join(', ')}.`;
  }

  return message;
};

export const hasNonokoOption = (value: string): boolean => parsePostOptions(value).some((option) => option === 'nonoko' || option === NONOKOSAGE_OPTION);

// The board's keyword no-bump sort matches a whole line of the reply, so the marker is its own last line.
const SAGE_MARKER_PATTERN = new RegExp(`(?:^|\\n)${SAGE_OPTION}\\n*$`);

/** Mark a reply as sage for the board's bump order. Validation only lets sage through on boards that support it. */
export const appendSageMarker = (content: string, options: string): string => {
  if (!parsePostOptions(options).some(isSageOption)) {
    return content;
  }
  return content ? `${content}\n${SAGE_OPTION}` : SAGE_OPTION;
};

/** 4chan never shows sage, so the marker line is hidden on boards whose bump order reads it. */
export const stripSageMarker = (content: string): string => content.replace(SAGE_MARKER_PATTERN, '');

export const isFortuneDirectoryCode = (directoryCode: string | undefined): boolean => !!directoryCode && FORTUNE_DIRECTORY_CODES.has(directoryCode);

export const isDiceDirectoryCode = (directoryCode: string | undefined): boolean => !!directoryCode && DICE_DIRECTORY_CODES.has(directoryCode);

/*
 * A post never stores a fortune or dice result. The composer publishes an opt-in marker, `[fortune]` or
 * `[dice=2d6+1]`, and every reader derives the result from the post's CID, so no text in a post can forge
 * one. On pseudonymous boards the CID covers the board's signature, so the poster cannot know the result
 * before the board stores the post. Without pseudonymity a modified client can compute candidate CIDs and
 * publish only one with the result it wants. Other clients reproduce the result with:
 *   fortune = FORTUNE_ENTRIES[sha256("fortune:" + cid) mod 13]
 *   dice roll i (from 0) = sha256("dice:" + cid + ":" + i) mod sides + 1
 * reading each digest as a big-endian unsigned integer.
 */
const FORTUNE_MARKER = '[fortune]';
const DICE_MARKER_PATTERN = '\\[dice=(\\d+)d(\\d+)(?:([+-])(\\d+))?\\]';

// Before the CID derivation, the poster's client rolled the result and stored it in the post. Posts from
// before this time keep showing that stored result; a newer post cannot claim an older timestamp, because
// boards reject publications more than 5 minutes off their clock. 2026-11-04T00:00:00Z.
const STORED_POST_OPTION_RESULTS_BEFORE_TIMESTAMP = 1793750400;
const LEGACY_FORTUNE_BBCODE_PATTERN = '\\[fortune color=(#[0-9a-fA-F]{6})\\]([^\\r\\n]*?)\\[\\/fortune\\]';
const LEGACY_FORTUNE_HTML_PATTERN = '<span class="fortune" style="color:(#[0-9a-fA-F]{6})"><br><br><b>Your fortune: ([^<]+)<\\/b><\\/span>';
const LEGACY_DICE_PATTERN = '<b>(Rolled \\d+(?:, \\d+)*(?: [+-] \\d+)?(?: = -?\\d+)? \\((\\d+)d(\\d+)(?: ([+-]) (\\d+))?\\))<br><br><\\/b>';
const FORTUNE_MARKERS_PATTERN = `\\[fortune\\]|${LEGACY_FORTUNE_BBCODE_PATTERN}|${LEGACY_FORTUNE_HTML_PATTERN}`;
const DICE_MARKERS_PATTERN = `${DICE_MARKER_PATTERN}|${LEGACY_DICE_PATTERN}`;

const getMatchingFortuneEntry = (color: string, text: string): FortuneEntry | undefined =>
  FORTUNE_ENTRIES.find((entry) => entry.color.toLowerCase() === color.toLowerCase() && entry.text === text);

interface FortuneMarker {
  index: number;
  length: number;
  storedFortune?: FortuneEntry;
}

interface DiceMarker {
  index: number;
  length: number;
  spec: DiceSpec | null;
  storedText?: string;
}

// Legacy fortune markup only counts when it names a real fortune, as old clients generated it.
const findFortuneMarkers = (content: string): FortuneMarker[] =>
  [...content.matchAll(new RegExp(FORTUNE_MARKERS_PATTERN, 'g'))].flatMap((match) => {
    const color = match[1] ?? match[3];
    const text = match[2] ?? match[4];
    if (!color) {
      return [{ index: match.index, length: match[0].length }];
    }
    const storedFortune = getMatchingFortuneEntry(color, text);
    return storedFortune ? [{ index: match.index, length: match[0].length, storedFortune }] : [];
  });

const findDiceMarkers = (content: string): DiceMarker[] =>
  [...content.matchAll(new RegExp(DICE_MARKERS_PATTERN, 'g'))].map((match) =>
    match[1] !== undefined
      ? { index: match.index, length: match[0].length, spec: getDiceSpec(match[1], match[2], match[3], match[4]) }
      : { index: match.index, length: match[0].length, spec: getDiceSpec(match[6], match[7], match[8], match[9]), storedText: match[5] },
  );

const removeMarkers = (content: string, markers: Array<{ index: number; length: number }>): string => {
  let result = '';
  let lastIndex = 0;
  for (const marker of markers.toSorted((a, b) => a.index - b.index)) {
    if (marker.index < lastIndex) continue;
    result += content.slice(lastIndex, marker.index);
    lastIndex = marker.index + marker.length;
  }
  return result + content.slice(lastIndex);
};

const stripMarkers = (content: string, { dice, fortune }: { dice: boolean; fortune: boolean }): string =>
  removeMarkers(content, [...(dice ? findDiceMarkers(content) : []), ...(fortune ? findFortuneMarkers(content) : [])]);

/** Hides fortune and dice markers, for previews of a publication outside its board's post view. */
export const stripPostOptionMarkers = (content: string): string => stripMarkers(content, { dice: true, fortune: true });

const getDiceMarker = ({ count, sides, modifierText }: DiceSpec): string => `[dice=${count}d${sides}${modifierText.replaceAll(' ', '')}]`;

const getDiceOption = (value: string, directoryCode: string | undefined): DiceSpec | null => {
  if (!isDiceDirectoryCode(directoryCode)) {
    return null;
  }

  for (const option of parsePostOptions(value)) {
    const diceOption = parseDiceOption(option);
    if (diceOption) {
      return diceOption;
    }
  }

  return null;
};

/**
 * The content to publish for the chosen options. Markers typed into the comment are dropped on boards
 * that read them, so the options field stays the only way to ask for a fortune or a roll.
 */
export const getContentWithPostOptions = (content: string, options: string, directoryCode: string | undefined): string => {
  const hasFortune = isFortuneDirectoryCode(directoryCode) && parsePostOptions(options).includes('fortune');
  const diceOption = getDiceOption(options, directoryCode);
  const markerTypes = { dice: isDiceDirectoryCode(directoryCode), fortune: isFortuneDirectoryCode(directoryCode) };
  // Removing `[fortune]` from `[fort[fortune]une]` leaves a new marker, so strip until nothing changes.
  let baseContent = content;
  for (let stripped = stripMarkers(baseContent, markerTypes); stripped !== baseContent; stripped = stripMarkers(baseContent, markerTypes)) {
    baseContent = stripped;
  }
  const contentWithDice = diceOption ? `${getDiceMarker(diceOption)}${baseContent}` : baseContent;
  return hasFortune ? `${contentWithDice}${FORTUNE_MARKER}` : contentWithDice;
};

const getCidDigestValue = (input: string): bigint => BigInt(`0x${bytesToHex(sha256(utf8ToBytes(input)))}`);

const getFortuneForCid = (cid: string): FortuneEntry => FORTUNE_ENTRIES[Number(getCidDigestValue(`fortune:${cid}`) % BigInt(FORTUNE_ENTRIES.length))];

const rollDiceForCid = (spec: DiceSpec, cid: string): DiceRoll => {
  const rolls = Array.from({ length: spec.count }, (_, index) => Number(getCidDigestValue(`dice:${cid}:${index}`) % BigInt(spec.sides)) + 1);
  return { ...spec, rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) + spec.modifier };
};

const getDiceRollText = (diceRoll: DiceRoll): string => {
  const rolls = diceRoll.rolls.join(', ');
  const total = diceRoll.count > 1 || diceRoll.modifier !== 0 ? ` = ${diceRoll.total}` : '';
  return `Rolled ${rolls}${diceRoll.modifierText}${total} (${diceRoll.count}d${diceRoll.sides}${diceRoll.modifierText})`;
};

export interface PostOptionResults {
  /** The comment with every fortune and dice marker removed. */
  content: string;
  diceText?: string;
  fortune?: FortuneEntry;
}

interface PostOptionResultsInput {
  content: string;
  /** Absent while the post is pending, so no result shows until the board has stored it. */
  cid?: string;
  timestamp?: number;
  /** The route's board and the post's own board: a post shows a result when either one has the option. */
  directoryCodes: Array<string | undefined>;
  /** An author edit could add a marker after the CID is known, so edited posts show no result. */
  isEdited: boolean;
}

/** Reads the fortune and dice the post asked for and removes their markers from the displayed comment. */
export const getPostOptionResults = ({ content, cid, timestamp, directoryCodes, isEdited }: PostOptionResultsInput): PostOptionResults => {
  const readsDice = directoryCodes.some(isDiceDirectoryCode);
  const readsFortune = directoryCodes.some(isFortuneDirectoryCode);
  if (!content || (!readsDice && !readsFortune)) {
    return { content };
  }

  const diceMarkers = readsDice ? findDiceMarkers(content) : [];
  const fortuneMarkers = readsFortune ? findFortuneMarkers(content) : [];
  const results: PostOptionResults = { content: removeMarkers(content, [...diceMarkers, ...fortuneMarkers]) };
  if (isEdited) {
    return results;
  }

  const usesStoredResults = typeof timestamp === 'number' && timestamp < STORED_POST_OPTION_RESULTS_BEFORE_TIMESTAMP;
  const diceMarker = diceMarkers[0];
  if (diceMarker && usesStoredResults && diceMarker.storedText) {
    results.diceText = diceMarker.storedText;
  } else if (diceMarker?.spec && cid) {
    results.diceText = getDiceRollText(rollDiceForCid(diceMarker.spec, cid));
  }

  const storedFortune = usesStoredResults ? fortuneMarkers.find((marker) => marker.storedFortune)?.storedFortune : undefined;
  if (storedFortune) {
    results.fortune = storedFortune;
  } else if (fortuneMarkers.length > 0 && cid) {
    results.fortune = getFortuneForCid(cid);
  }

  return results;
};
