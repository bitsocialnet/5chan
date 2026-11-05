import type { Community } from '@bitsocial/bitsocial-react-hooks';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { getBoardNoBumpKeywords } from './board-sort-utils';
import {
  FORTUNE_ENTRIES,
  FORTUNE_MARKER,
  findMarkers,
  getDiceSpec,
  stripMarkersUntilStable,
  usesStoredResults,
  type DiceSpec,
  type FortuneEntry,
} from './post-option-markers';

export const POST_OPTIONS_VALIDATION_DELAY_MS = 700;
export const SAGE_FAQ_LINK_LABEL = 'learn why';
export const SAGE_FAQ_PATH = '/faq#sage';
const SAGE_OPTION = 'sage';
const NONOKOSAGE_OPTION = 'nonokosage';
const FORTUNE_DIRECTORY_CODES = new Set(['b', 's5s']);
const DICE_DIRECTORY_CODES = new Set(['qst', 'tg']);
const POST_OPTION_ROUTE_DIRECTORY_CODES = new Set([...FORTUNE_DIRECTORY_CODES, ...DICE_DIRECTORY_CODES]);

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

const parsePostOptions = (value: string): string[] => value.trim().split(/\s+/).filter(Boolean);

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
  const baseContent = stripMarkersUntilStable(content, {
    dice: isDiceDirectoryCode(directoryCode),
    fortune: isFortuneDirectoryCode(directoryCode),
    storedOnly: false,
  });
  const contentWithDice = diceOption ? `${getDiceMarker(diceOption)}${baseContent}` : baseContent;
  return hasFortune ? `${contentWithDice}${FORTUNE_MARKER}` : contentWithDice;
};

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
  /** The post's own board, so a post reads the same on every route. */
  directoryCode: string | undefined;
  /** An author edit could add a marker after the CID is known, so edited posts show no result. */
  isEdited: boolean;
}

/** Reads the fortune and dice the post asked for and removes their markers from the displayed comment. */
export const getPostOptionResults = ({ content, cid, timestamp, directoryCode, isEdited }: PostOptionResultsInput): PostOptionResults => {
  const markerTypes = { dice: isDiceDirectoryCode(directoryCode), fortune: isFortuneDirectoryCode(directoryCode), storedOnly: usesStoredResults(timestamp) };
  if (!content || (!markerTypes.dice && !markerTypes.fortune)) {
    return { content };
  }

  const { diceMarkers, fortuneMarkers } = findMarkers(content, markerTypes);
  const results: PostOptionResults = { content: stripMarkersUntilStable(content, markerTypes) };
  if (isEdited) {
    return results;
  }

  const diceMarker = diceMarkers[0];
  if (markerTypes.storedOnly) {
    if (diceMarker?.storedText) results.diceText = diceMarker.storedText;
    if (fortuneMarkers[0]?.storedFortune) results.fortune = fortuneMarkers[0].storedFortune;
    return results;
  }

  if (cid && diceMarker?.spec) results.diceText = getDiceRollText(rollDiceForCid(diceMarker.spec, cid));
  if (cid && fortuneMarkers.length > 0) results.fortune = getFortuneForCid(cid);
  return results;
};
