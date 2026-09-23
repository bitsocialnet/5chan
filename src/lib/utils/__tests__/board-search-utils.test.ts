import { describe, expect, it } from 'vitest';
import { getBoardSearchTerms, mergeBoardSources, searchBoards, type BoardSearchSources } from '../board-search-utils';

const sources: BoardSearchSources = {
  directories: [
    { address: 'literature-posting.bso', directoryCode: 'lit', publicKey: '12D3KooWKXimxiZWtgF3LoTdaW3btHhDzJN7P3qrsgHwRkow186x', title: '/lit/ - Literature' },
    { address: 'music-posting.bso', directoryCode: 'mu', title: '/mu/ - Music' },
    { address: 'politically-incorrect.bso', directoryCode: 'pol', nsfw: true, title: '/pol/ - Politically Incorrect' },
    { address: 'business-and-finance.bso', directoryCode: 'biz', title: '/biz/ - Business & Finance' },
  ],
  candidates: [
    {
      directoryCode: 'biz',
      title: '/biz/ - Business & Finance',
      boards: [{ address: 'business-and-finance.bso' }, { address: 'bizraelis.bso' }],
    },
  ],
  specialBoards: [{ address: 'off-topic.bso', aliases: ['off-topic.eth'], directoryCode: 'trash', nsfw: true, title: '/trash/ - Off-topic' }],
  subscriptions: ['my-private-board.bso', ' ', 'music-posting.eth', '12D3KooWKXimxiZWtgF3LoTdaW3btHhDzJN7P3qrsgHwRkow186x', '/evil.example'],
  indexed: [
    { address: 'music-posting.bso', nsfw: 0, post_count: 50, title: '/mu/ - Music' },
    { address: 'bizraelis.bso', nsfw: 0, post_count: 39, title: '/biz/ - Business & Finance' },
    { address: 'torrents-posting.bso', nsfw: 1, post_count: 4, title: 'Torrents' },
    { address: 'literature-posting.bso', description: 'books and writing', nsfw: 0, post_count: 26, title: '/lit/ - Literature' },
  ],
};

describe('getBoardSearchTerms', () => {
  it('splits the words and reads a slashed code as the code', () => {
    expect(getBoardSearchTerms('Old Internet culture')).toEqual(['old', 'internet', 'culture']);
    expect(getBoardSearchTerms('/lit/')).toEqual(['lit']);
    expect(getBoardSearchTerms('lit lit')).toEqual(['lit']);
  });

  it('splits a pasted directory title into its words and a typed address into its name', () => {
    expect(getBoardSearchTerms('/biz/ - Business & Finance')).toEqual(['biz', 'business', 'finance']);
    expect(getBoardSearchTerms('music.bso')).toEqual(['music']);
    expect(getBoardSearchTerms('music-posting.eth')).toEqual(['music', 'posting']);
  });
});

describe('mergeBoardSources', () => {
  it('dedupes a board across every list, letting the directory code, title and nsfw flag win', () => {
    const merged = mergeBoardSources(sources);
    const music = merged.find((board) => board.address === 'music-posting.bso');

    // Listed under .bso by the directory, .eth by the subscription and .bso again by the indexer: one board.
    expect(merged.filter((board) => board.address.startsWith('music-posting'))).toHaveLength(1);
    expect(music).toMatchObject({ directoryCode: 'mu', indexedPostCount: 50, nsfw: false, title: 'Music' });
    // The candidate that is not serving /biz/ keeps the directory's name but gets no code.
    expect(merged.find((board) => board.address === 'bizraelis.bso')).toMatchObject({ directoryCode: undefined, title: 'Business & Finance' });
    // A subscription nobody else lists is still findable.
    expect(merged.find((board) => board.address === 'my-private-board.bso')).toBeTruthy();
    expect(merged.find((board) => board.address === 'off-topic.bso')).toMatchObject({ directoryCode: 'trash', nsfw: true, title: 'Off-topic' });
    // A title without a code part is kept whole.
    expect(merged.find((board) => board.address === 'torrents-posting.bso')).toMatchObject({ nsfw: true, title: 'Torrents' });
    // A subscription by peer id is the directory board that carries that key, not a second row.
    expect(merged.filter((board) => board.publicKey === '12D3KooWKXimxiZWtgF3LoTdaW3btHhDzJN7P3qrsgHwRkow186x')).toHaveLength(1);
    expect(merged.some((board) => board.address.startsWith('12D3Koo'))).toBe(false);
    // Only address shapes are kept: a path could turn into an off-site link.
    expect(merged.some((board) => board.address.includes('/'))).toBe(false);
  });
});

describe('searchBoards', () => {
  it('pins the board whose code the query names and does not match the code inside other words', () => {
    const results = searchBoards(sources, 'lit');

    expect(results[0]).toMatchObject({ address: 'literature-posting.bso', directoryCode: 'lit', exact: true });
    // "lit" is inside "politically", but only word starts count.
    expect(results.map((board) => board.address)).not.toContain('politically-incorrect.bso');
    expect(results).toHaveLength(1);
  });

  it('reads a slashed code, a full address, an alias and a public key as exact matches', () => {
    expect(searchBoards(sources, '/lit/')[0]).toMatchObject({ address: 'literature-posting.bso', exact: true });
    expect(searchBoards(sources, 'music-posting.bso')[0]).toMatchObject({ address: 'music-posting.bso', exact: true });
    expect(searchBoards(sources, 'MUSIC-POSTING.ETH')[0]).toMatchObject({ address: 'music-posting.bso', exact: true });
    expect(searchBoards(sources, '12D3KooWKXimxiZWtgF3LoTdaW3btHhDzJN7P3qrsgHwRkow186x')[0]).toMatchObject({ address: 'literature-posting.bso', exact: true });
  });

  it('finds a board by the name the homepage lists it under', () => {
    expect(searchBoards(sources, 'Music')).toMatchObject([{ address: 'music-posting.bso', exact: false }]);
    // Every term has to land somewhere on the board, across its title and address together.
    expect(searchBoards(sources, 'music posting')).toMatchObject([{ address: 'music-posting.bso' }]);
    expect(searchBoards(sources, 'old internet culture')).toEqual([]);
  });

  it('finds a board by its full directory title, punctuation included', () => {
    expect(searchBoards(sources, '/mu/ - Music')).toMatchObject([{ address: 'music-posting.bso' }]);
    // The board serving /biz/ lists before the candidate with the same name, whatever the indexer holds of each.
    expect(searchBoards(sources, 'Business & Finance').map((board) => board.address)).toEqual(['business-and-finance.bso', 'bizraelis.bso']);
    expect(searchBoards(sources, '/biz/ - Business & Finance')[0]).toMatchObject({ address: 'business-and-finance.bso' });
  });

  it('keeps a .sol name apart from the same name under .bso', () => {
    const results = searchBoards({ directories: [{ address: 'music.bso', directoryCode: 'mu', title: '/mu/ - Music' }] }, 'music.sol');

    // No list carries music.sol, so it is offered as typed; music.bso is only the name it resembles.
    expect(results.map((board) => [board.address, board.exact, board.unlisted])).toEqual([
      ['music.sol', true, true],
      ['music.bso', false, undefined],
    ]);
    expect(mergeBoardSources({ subscriptions: ['music.sol', 'music.bso'] })).toHaveLength(2);
  });

  it('lets a curated nsfw verdict beat the indexer, and takes the indexer where nothing local declares one', () => {
    const merged = mergeBoardSources({
      directories: [
        { address: 'business-and-finance.bso', directoryCode: 'biz', nsfw: false, title: '/biz/ - Business & Finance' },
        { address: 'random.bso', directoryCode: 'b', title: '/b/ - Random' },
      ],
      indexed: [
        { address: 'business-and-finance.bso', nsfw: 1, post_count: 1, title: null },
        { address: 'random.bso', nsfw: 1, post_count: 1, title: null },
      ],
    });

    expect(merged.find((board) => board.address === 'business-and-finance.bso')?.nsfw).toBe(false);
    expect(merged.find((board) => board.address === 'random.bso')?.nsfw).toBe(true);
    // A row nothing declares is shown as safe.
    expect(searchBoards({ subscriptions: ['quiet-board.bso'] }, 'quiet')).toMatchObject([{ address: 'quiet-board.bso', nsfw: false }]);
  });

  it('folds an address-only row into the keyed row once a public key connects them', () => {
    const publicKey = '12D3KooWKXimxiZWtgF3LoTdaW3btHhDzJN7P3qrsgHwRkow186x';
    const merged = mergeBoardSources({
      // The directory names the board without its key, a candidate list keys another alias of it,
      // and a later candidate keys the directory's alias: one board, one row.
      directories: [{ address: 'literature.bso', directoryCode: 'lit', title: '/lit/ - Literature' }],
      candidates: [
        { directoryCode: 'lit', boards: [{ address: 'lit-posting.bso', publicKey }] },
        { directoryCode: 'lit', boards: [{ address: 'literature.bso', publicKey }] },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ directoryCode: 'lit', publicKey, title: 'Literature' });
  });

  it('lists a board subscribed only by peer id once when that id is searched', () => {
    const peerId = '12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy';
    const results = searchBoards({ subscriptions: [peerId] }, peerId);

    // The subscription is the exact match, so no unlisted row is added for the same id.
    expect(results).toEqual([{ address: peerId, exact: true, nsfw: false, publicKey: peerId }]);
  });

  it('offers a typed address as spelled above the boards its name resembles', () => {
    // "mu.eth" is an address, not the /mu/ code, so it is not an exact match for /mu/.
    expect(searchBoards(sources, 'mu.eth').map((board) => [board.address, board.exact, board.unlisted])).toEqual([
      ['mu.eth', true, true],
      ['music-posting.bso', false, undefined],
    ]);
    expect(searchBoards(sources, 'music.bso').map((board) => board.address)).toEqual(['music.bso', 'music-posting.bso']);
    // A known address is only listed once, as itself.
    expect(searchBoards(sources, 'music-posting.bso').map((board) => board.address)).toEqual(['music-posting.bso']);
  });

  it('ranks the serving board before its candidates and breaks ties on what the indexer holds', () => {
    const results = searchBoards(sources, 'biz');

    expect(results.map((board) => board.address)).toEqual(['business-and-finance.bso', 'bizraelis.bso']);
    expect(results[0].exact).toBe(true);
    // A code the query starts ranks above a title-only match.
    expect(searchBoards(sources, 'bi').map((board) => board.address)).toEqual(['business-and-finance.bso', 'bizraelis.bso']);
  });

  it('matches a description the indexer crawled, last', () => {
    expect(searchBoards(sources, 'writing')).toMatchObject([{ address: 'literature-posting.bso', exact: false }]);
  });

  it('still offers an unlisted address, but not an unlisted word', () => {
    expect(searchBoards(sources, 'unlisted-board.bso')).toEqual([{ address: 'unlisted-board.bso', exact: true, nsfw: false, unlisted: true }]);
    expect(searchBoards(sources, '/unlisted-board.eth/')).toMatchObject([{ address: 'unlisted-board.eth', unlisted: true }]);
    expect(searchBoards(sources, '12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy')).toMatchObject([
      { address: '12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy', unlisted: true },
    ]);
    expect(searchBoards(sources, 'bitcoin')).toEqual([]);
    expect(searchBoards(sources, 'not a.bso board')).toEqual([]);
    // A path is not an address, so it never becomes a link.
    expect(searchBoards(sources, '//evil.example/x.bso')).toEqual([]);
  });

  it('does not let the address suffix match every board', () => {
    expect(searchBoards(sources, 'bso')).toEqual([]);
  });

  it('ignores empty input', () => {
    expect(searchBoards(sources, '   ')).toEqual([]);
    expect(searchBoards(sources, '//')).toEqual([]);
  });
});
