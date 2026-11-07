import { describe, expect, it } from 'vitest';
import { ALL_BOARDS_VISIBLE, BOARD_CODE_GROUPS, getAllBoardCodes } from '../../constants/board-codes';
import { createBoardCodeVisibility, getBoardCodeGroups } from './board-code-groups';
import { getFallbackDirectoriesData } from './directories';

describe('getBoardCodeGroups', () => {
  it('keeps the classic groups when every directory already has a bracket slot', () => {
    const result = getBoardCodeGroups(getFallbackDirectoriesData().communities);

    expect(result.publishedCodes).toEqual([]);
    expect(result.groups).toBe(BOARD_CODE_GROUPS);
    expect(result.codes).toEqual(getAllBoardCodes());
  });

  it('adds directories published after this build as a trailing sorted group', () => {
    const result = getBoardCodeGroups([
      { address: 'biz.bso', title: '/biz/ - Business & Finance', directoryCode: 'biz' },
      { address: 'zines.bso', title: '/zines/ - Zines', directoryCode: 'zines' },
      { address: 'diyaudio.bso', title: '/diyaudio/ - DIY Audio' },
      { address: 'untitled.bso' },
    ]);

    expect(result.publishedCodes).toEqual(['diyaudio', 'zines']);
    expect(result.groups.at(-1)).toEqual(['diyaudio', 'zines']);
    expect(result.groups.slice(0, -1)).toEqual(BOARD_CODE_GROUPS);
    expect(result.codes).toEqual([...getAllBoardCodes(), 'diyaudio', 'zines']);
  });
});

describe('createBoardCodeVisibility', () => {
  it('shows published boards when the saved selection keeps every bundled board', () => {
    const isShown = createBoardCodeVisibility(new Set(getAllBoardCodes()), ['zines']);

    expect(isShown('zines')).toBe(true);
    expect(isShown('biz')).toBe(true);
  });

  it('shows every board for a selection saved as all boards, even when it lacks boards bundled later', () => {
    const isShown = createBoardCodeVisibility(new Set(['jp', ALL_BOARDS_VISIBLE]), ['zines']);

    expect(isShown('biz')).toBe(true);
    expect(isShown('zines')).toBe(true);
  });

  it('shows only the listed boards for a narrower selection', () => {
    const isShown = createBoardCodeVisibility(new Set(['jp', 'tg']), ['zines']);

    expect(isShown('jp')).toBe(true);
    expect(isShown('biz')).toBe(false);
    expect(isShown('zines')).toBe(false);
    expect(createBoardCodeVisibility(new Set(['jp', 'zines']), ['zines'])('zines')).toBe(true);
  });
});
