import { describe, expect, it, vi } from 'vitest';
import {
  appendSageMarker,
  getContentWithPostOptionState,
  getNonokoPendingAccountCommentIndex,
  getNonokoPendingRouteState,
  getPostOptionsPublishContentLength,
  getPostOptionsValidationError,
  getUnsupportedPostOptionsMessage,
  hasNonokoOption,
  isSageSupportedByBoard,
  stripGeneratedFortuneMarkup,
  stripSageMarker,
} from '../post-options-utils';

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

  it('reads the nonoko pending account comment index from direct and wrapped route state', () => {
    expect(getNonokoPendingRouteState(7)).toEqual({ nonokoPendingAccountCommentIndex: 7 });
    expect(getNonokoPendingAccountCommentIndex({ nonokoPendingAccountCommentIndex: 7 })).toBe(7);
    expect(getNonokoPendingAccountCommentIndex({ usr: { nonokoPendingAccountCommentIndex: 8 } })).toBe(8);
    expect(getNonokoPendingAccountCommentIndex({ nonokoPendingAccountCommentIndex: -1 })).toBeUndefined();
    expect(getNonokoPendingAccountCommentIndex({ nonokoPendingAccountCommentIndex: '7' })).toBeUndefined();
  });

  it('strips generated fortune markers before appending a new fortune on fortune boards', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const fortuneEntryRef = { current: null };
    const diceRollRef = { current: null };

    expect(
      getContentWithPostOptionState(
        'body[fortune color=#6023f8]Outlook good[/fortune]<span class="fortune" style="color:#7fec11"><br><br><b>Your fortune: Bad Luck</b></span>',
        'fortune',
        fortuneEntryRef,
        diceRollRef,
        's5s',
      ),
    ).toBe('body[fortune color=#fd4d32]Excellent Luck[/fortune]');

    randomSpy.mockRestore();
  });

  it('strips user-entered generated fortune markers even when fortune is not selected on fortune boards', () => {
    const fortuneEntryRef = { current: null };
    const diceRollRef = { current: null };

    expect(getContentWithPostOptionState('body[fortune color=#6023f8]Outlook good[/fortune]', '', fortuneEntryRef, diceRollRef, 's5s')).toBe('body');
  });

  it('keeps invalid or non-fortune-board fortune-looking text', () => {
    const fortuneEntryRef = { current: null };
    const diceRollRef = { current: null };
    const userText = '[fortune color=#000000]Excellent Luck[/fortune]';

    expect(stripGeneratedFortuneMarkup(userText)).toBe(userText);
    expect(getContentWithPostOptionState('body[fortune color=#6023f8]Outlook good[/fortune]', '', fortuneEntryRef, diceRollRef, 'mu')).toBe(
      'body[fortune color=#6023f8]Outlook good[/fortune]',
    );
  });

  it('counts hidden fortune output against publish length without rolling a fortune', () => {
    const longestFortune = '[fortune color=#0893e1]You will meet a dark handsome stranger[/fortune]';

    expect(getPostOptionsPublishContentLength('body', 'fortune', 's5s')).toBe('body'.length + longestFortune.length);
    expect(getPostOptionsPublishContentLength('body   ', 'fortune', 's5s')).toBe('body   '.length + longestFortune.length);
    expect(getPostOptionsPublishContentLength('body   ', 'fortune', 'mu')).toBe('body'.length);
  });
});
