import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  appendSageMarker,
  getContentWithPostOptions,
  getPostOptionResults,
  getPostOptionsValidationError,
  getUnsupportedPostOptionsMessage,
  hasNonokoOption,
  isSageSupportedByBoard,
  stripSageMarker,
} from '../post-options-utils';
import { stripPostOptionMarkers } from '../post-option-markers';

const FORTUNES = [
  'Bad Luck',
  'Average Luck',
  'Good Luck',
  'Excellent Luck',
  'Reply hazy, try again',
  'Godly Luck',
  'Very Bad Luck',
  'Outlook good',
  'Better not tell you now',
  'You will meet a dark handsome stranger',
  'ｷﾀ━━━━━━(ﾟ∀ﾟ)━━━━━━ !!!!',
  '（　´_ゝ`）ﾌｰﾝ ',
  'Good news will come to you by mail',
];
// The derivation other clients are told to reproduce, computed independently of the implementation.
const digest = (input: string) => BigInt(`0x${createHash('sha256').update(input).digest('hex')}`);
const expectedFortune = (cid: string) => FORTUNES[Number(digest(`fortune:${cid}`) % BigInt(FORTUNES.length))];
const expectedRolls = (cid: string, count: number, sides: number) =>
  Array.from({ length: count }, (_, index) => Number(digest(`dice:${cid}:${index}`) % BigInt(sides)) + 1);

const CID = 'QmPostCid';
const AFTER_CUTOFF = 1800000000;
const BEFORE_CUTOFF = 1780000000;

describe('post-options-utils', () => {
  it('rejects additional dice options instead of dropping them', () => {
    expect(getUnsupportedPostOptionsMessage('dice+1d6 dice+1d20', 'qst')).toBe('Unsupported options: dice+1d20.');
  });

  it('supports nonoko everywhere and sage only on boards whose bump order skips sage replies', () => {
    expect(getUnsupportedPostOptionsMessage('nonoko', undefined)).toBeNull();
    expect(getUnsupportedPostOptionsMessage('sage', 'b')).toBe('Unsupported options: sage [learn why].');
    expect(getUnsupportedPostOptionsMessage('nonokosage', 'b')).toBe('Unsupported options: nonokosage [learn why].');
    expect(getUnsupportedPostOptionsMessage('sage', 'b', true)).toBeNull();
    expect(getUnsupportedPostOptionsMessage('nonoko sage nonokosage', 'b', true)).toBeNull();
    expect(hasNonokoOption('fortune nonoko')).toBe(true);
    expect(hasNonokoOption('nonokosage')).toBe(true);
    expect(hasNonokoOption('sage')).toBe(false);
  });

  it('reads sage support from the keywords of the board no-bump sort', () => {
    const makeBoard = (activePageSort: object) => ({
      updatedAt: 1,
      pageSorts: { posts: { active: activePageSort } },
      posts: { pages: { active: { comments: [], nextCid: 'next' } }, pageCids: { active: 'first' } },
    });

    expect(isSageSupportedByBoard(makeBoard({ name: '@pkcprotocol/active-page-sort', publicOptions: { noBumpKeywords: 'nobump, sage' } }))).toBe(true);
    expect(isSageSupportedByBoard(makeBoard({ publicOptions: { noBumpKeywords: 'nobump' } }))).toBe(false);
    expect(isSageSupportedByBoard(makeBoard({ name: 'active' }))).toBe(false);
    expect(isSageSupportedByBoard(undefined)).toBe(false);
  });

  it('marks sage replies with a last line the no-bump sort matches and hides it for display', () => {
    expect(appendSageMarker('reply', 'sage')).toBe('reply\nsage');
    expect(appendSageMarker('', 'nonokosage')).toBe('sage');
    expect(appendSageMarker('reply', 'nonoko')).toBe('reply');

    expect(stripSageMarker('reply\nsage')).toBe('reply');
    expect(stripSageMarker('sage')).toBe('');
    expect(stripSageMarker('reply\nsage\n')).toBe('reply');
    // prose mentioning the keyword is not the marker
    expect(stripSageMarker('sage is overused')).toBe('sage is overused');
    expect(stripSageMarker('please sage')).toBe('please sage');
  });

  it('describes board-specific options with supported directories', () => {
    expect(getPostOptionsValidationError('fortune', 'mu')).toEqual({
      unsupportedOptions: ['fortune'],
      supportedDirectoryCodesByOption: [{ option: 'fortune', directoryCodes: ['b', 's5s'] }],
    });
    expect(getUnsupportedPostOptionsMessage('fortune', 'mu')).toBe('Unsupported options: fortune. Option "fortune" is supported on: /b/, /s5s/.');
    expect(getUnsupportedPostOptionsMessage('sage fortune', 'pol')).toBe('Unsupported options: sage [learn why], fortune. Option "fortune" is supported on: /b/, /s5s/.');
    expect(getPostOptionsValidationError('fortune dice+1d6', 'mu')).toEqual({
      unsupportedOptions: ['fortune', 'dice+1d6'],
      supportedDirectoryCodesByOption: [
        { option: 'fortune', directoryCodes: ['b', 's5s'] },
        { option: 'dice+1d6', directoryCodes: ['qst', 'tg'] },
      ],
    });
  });

  it('publishes fortune and dice as markers and drops markers typed into the comment', () => {
    expect(getContentWithPostOptions('body[fortune color=#6023f8]Outlook good[/fortune][fortune]', 'fortune', 's5s')).toBe('body[fortune]');
    expect(getContentWithPostOptions('body[fortune]', '', 'b')).toBe('body');
    expect(getContentWithPostOptions('body[fortune]', 'fortune', 'mu')).toBe('body[fortune]');
    expect(getContentWithPostOptions('<b>Rolled 6 (1d6)<br><br></b>[dice=1d20]body', 'dice+1d6+3', 'tg')).toBe('[dice=1d6+3]body');
    expect(getContentWithPostOptions('body', 'dice+40d6-2', 'qst')).toBe('[dice=25d6-2]body');
    expect(getContentWithPostOptions('body', 'dice+1d6', 'b')).toBe('body');
    // Stripping one marker must not leave another one assembled from the surrounding text.
    expect(getContentWithPostOptions('[fort[fortune]une]hi', '', 'b')).toBe('hi');
    expect(getContentWithPostOptions('[dice=[dice=1d6]20d20]hi', '', 'tg')).toBe('hi');
  });

  it('rejects dice numbers too large to publish exactly', () => {
    expect(getPostOptionsValidationError('dice+1d1000000000000000000000', 'tg')).toEqual({
      unsupportedOptions: ['dice+1d1000000000000000000000'],
      supportedDirectoryCodesByOption: [],
    });
    expect(getContentWithPostOptions('x', 'dice+1d6+1000000000000000000000', 'tg')).toBe('x');
    // Each number fits, but the highest total would not, so the shown total could differ from the shown rolls.
    expect(getContentWithPostOptions('x', 'dice+25d9007199254740991', 'tg')).toBe('x');
    expect(getPostOptionResults({ content: '[dice=2d9007199254740991]x', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'tg', isEdited: false })).toEqual({
      content: 'x',
    });
    expect(getPostOptionResults({ content: '[dice=1d9007199254740991]x', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'tg', isEdited: false }).diceText).toMatch(
      /^Rolled \d+ \(1d9007199254740991\)$/,
    );
  });

  it('strips markers that removing another marker assembles', () => {
    expect(getPostOptionResults({ content: '[fort[fortune]une]hi', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'b', isEdited: false })).toEqual({
      content: 'hi',
      fortune: expect.objectContaining({ text: expectedFortune(CID) }),
    });
    expect(stripPostOptionMarkers('[dice=[dice=1d6]20d20]hi', { directoryCode: 'tg' })).toBe('hi');
  });

  it('derives the fortune from the post CID and ignores any result written in the comment', () => {
    const forged = 'body[fortune color=#d302a7]Godly Luck[/fortune]';

    expect(getPostOptionResults({ content: 'body[fortune]', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'b', isEdited: false })).toEqual({
      content: 'body',
      fortune: expect.objectContaining({ text: expectedFortune(CID) }),
    });
    expect(getPostOptionResults({ content: forged, cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 's5s', isEdited: false }).fortune?.text).toBe(expectedFortune(CID));
  });

  it('derives dice rolls from the post CID and the requested dice', () => {
    const rolls = expectedRolls(CID, 3, 20);
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + 2;

    expect(getPostOptionResults({ content: '[dice=3d20+2]body', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'qst', isEdited: false })).toEqual({
      content: 'body',
      diceText: `Rolled ${rolls.join(', ')} + 2 = ${total} (3d20 + 2)`,
    });
    // A roll written by an older client still asks for its dice, but no longer decides them.
    expect(getPostOptionResults({ content: '<b>Rolled 6 (1d6)<br><br></b>body', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'tg', isEdited: false }).diceText).toBe(
      `Rolled ${expectedRolls(CID, 1, 6)[0]} (1d6)`,
    );
  });

  it('keeps results stored by posts from before the CID derivation', () => {
    const legacyContent = '<b>Rolled 6 (1d6)<br><br></b>body[fortune color=#d302a7]Godly Luck[/fortune]';

    expect(getPostOptionResults({ content: legacyContent, cid: CID, timestamp: BEFORE_CUTOFF, directoryCode: 'b', isEdited: false })).toEqual({
      content: '<b>Rolled 6 (1d6)<br><br></b>body',
      fortune: { color: '#d302a7', text: 'Godly Luck' },
    });
    expect(getPostOptionResults({ content: legacyContent, cid: CID, timestamp: BEFORE_CUTOFF, directoryCode: 'tg', isEdited: false })).toEqual({
      content: 'body[fortune color=#d302a7]Godly Luck[/fortune]',
      diceText: 'Rolled 6 (1d6)',
    });
    expect(stripPostOptionMarkers(legacyContent, { directoryCode: 'b', timestamp: BEFORE_CUTOFF })).toBe('<b>Rolled 6 (1d6)<br><br></b>body');
    expect(stripPostOptionMarkers(legacyContent, { directoryCode: 'tg', timestamp: BEFORE_CUTOFF })).toBe('body[fortune color=#d302a7]Godly Luck[/fortune]');
  });

  it('leaves typed markers as text in posts from before the CID derivation', () => {
    // Older clients never read a typed `[fortune]` or `[dice=…]`, so those posts showed it as written.
    const typed = 'use [fortune] for luck, then roll [dice=1d20]';

    expect(getPostOptionResults({ content: typed, cid: CID, timestamp: BEFORE_CUTOFF, directoryCode: 'b', isEdited: false })).toEqual({ content: typed });
    expect(getPostOptionResults({ content: typed, cid: CID, timestamp: BEFORE_CUTOFF, directoryCode: 'tg', isEdited: false })).toEqual({ content: typed });
    expect(stripPostOptionMarkers(typed, { directoryCode: 'b', timestamp: BEFORE_CUTOFF })).toBe(typed);
    expect(stripPostOptionMarkers(typed, { directoryCode: 'b', timestamp: AFTER_CUTOFF })).toBe('use  for luck, then roll [dice=1d20]');
  });

  it('shows no result while pending or after an author edit, and hides the markers', () => {
    expect(getPostOptionResults({ content: '[dice=1d6]body[fortune]', timestamp: AFTER_CUTOFF, directoryCode: 'b', isEdited: false })).toEqual({
      content: '[dice=1d6]body',
    });
    expect(getPostOptionResults({ content: '[dice=1d6]body', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'tg', isEdited: true })).toEqual({ content: 'body' });
    expect(
      getPostOptionResults({ content: 'body[fortune color=#d302a7]Godly Luck[/fortune]', cid: CID, timestamp: BEFORE_CUTOFF, directoryCode: 'b', isEdited: true }),
    ).toEqual({ content: 'body' });
  });

  it('leaves markers and fortune-looking text alone where they are not read', () => {
    const userText = 'body[fortune color=#000000]Excellent Luck[/fortune]';

    expect(getPostOptionResults({ content: '[dice=1d6]body[fortune]', cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'mu', isEdited: false })).toEqual({
      content: '[dice=1d6]body[fortune]',
    });
    expect(getPostOptionResults({ content: userText, cid: CID, timestamp: AFTER_CUTOFF, directoryCode: 'b', isEdited: false })).toEqual({ content: userText });
    // Previews hide only the markers the post's board reads, so they match the post and what was published.
    expect(stripPostOptionMarkers('[dice=2d6]body[fortune]', { directoryCode: 'b' })).toBe('[dice=2d6]body');
    expect(stripPostOptionMarkers('[dice=2d6]body[fortune]', { directoryCode: 'tg' })).toBe('body[fortune]');
    expect(stripPostOptionMarkers('the syntax is [dice=2d6]', { directoryCode: 'g' })).toBe('the syntax is [dice=2d6]');
    expect(stripPostOptionMarkers('[fortune]', { directoryCode: undefined })).toBe('[fortune]');
    expect(stripPostOptionMarkers(userText, { directoryCode: 'b' })).toBe(userText);
  });
});
