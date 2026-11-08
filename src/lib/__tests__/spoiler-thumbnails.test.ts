import { describe, expect, it } from 'vitest';
import { DEFAULT_SPOILER_THUMBNAIL, getSpoilerThumbnail } from '../spoiler-thumbnails';
import { getVendoredDirectoryLists } from '../utils/directory-list-lookup-utils';

const directories = [
  { address: 'anime.example.bso', directoryCode: 'a', publicKey: 'anime-public-key' },
  { address: 'games.example.bso', title: '/v/ - Video Games' },
  { address: 'music.example.bso', directoryCode: 'mu' },
];

describe('getSpoilerThumbnail', () => {
  it('uses board membership, including address aliases and public keys', () => {
    expect(getSpoilerThumbnail('anime.example.bso', directories)).toBe('assets/spoilers/a.png');
    expect(getSpoilerThumbnail('anime.example.eth', directories)).toBe('assets/spoilers/a.png');
    expect(getSpoilerThumbnail('anime-public-key', directories)).toBe('assets/spoilers/a.png');
    expect(getSpoilerThumbnail('games.example.bso', directories)).toBe('assets/spoilers/v.png');
  });

  it('recognizes vendored candidate boards even when they are absent from the selected directories', () => {
    const candidate = getVendoredDirectoryLists().find((directory) => directory.directoryCode === 'a')?.boards[0];
    expect(candidate).toBeDefined();
    expect(getSpoilerThumbnail(candidate!.address, [])).toBe('assets/spoilers/a.png');
  });

  it('uses the custom spoiler for the actual s5s directory', () => {
    const directory = getVendoredDirectoryLists().find((entry) => entry.directoryCode === 's5s');
    const board = directory?.boards[0];
    expect(board).toBeDefined();
    expect(getSpoilerThumbnail(board!.address, [])).toBe('assets/spoilers/s4s.png');
    expect(getSpoilerThumbnail(board!.address, [{ ...board!, directoryCode: directory!.directoryCode }])).toBe('assets/spoilers/s4s.png');
  });

  it('keeps the generic thumbnail for unsupported, independent, and missing boards', () => {
    for (const address of ['music.example.bso', 'independent.example', 'a', undefined]) {
      expect(getSpoilerThumbnail(address, directories)).toBe(DEFAULT_SPOILER_THUMBNAIL);
    }
    expect(getSpoilerThumbnail('independent.example', [{ address: 'independent.example', directoryCode: '__proto__' }])).toBe(DEFAULT_SPOILER_THUMBNAIL);
  });
});
