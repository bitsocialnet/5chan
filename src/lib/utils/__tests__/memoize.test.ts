import { describe, expect, it, vi } from 'vitest';
import { memoize } from '../memoize';

describe('memoize', () => {
  it('returns the cached result for the same arguments, compared by identity', () => {
    const fn = vi.fn((info: object, link: string) => ({ info, link }));
    const memoized = memoize(fn, { max: 10 });
    const info = {};

    const first = memoized(info, 'https://a.example');
    expect(memoized(info, 'https://a.example')).toBe(first);
    expect(memoized({}, 'https://a.example')).not.toBe(first);
    expect(memoized(info, 'https://b.example')).not.toBe(first);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('evicts the least recently used result beyond max', () => {
    const fn = vi.fn((key: string) => ({ key }));
    const memoized = memoize(fn, { max: 2 });

    const a = memoized('a');
    memoized('b');
    memoized('a'); // a is now the most recently used
    memoized('c'); // evicts b
    expect(memoized('a')).toBe(a);
    expect(fn).toHaveBeenCalledTimes(3);
    memoized('b');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('evicts one of several results that share a first argument', () => {
    const fn = vi.fn((info: object, link: string) => `${link}`);
    const memoized = memoize(fn, { max: 2 });
    const info = {};

    memoized(info, 'a');
    memoized(info, 'b');
    memoized(info, 'c'); // evicts (info, 'a')
    memoized(info, 'b');
    memoized(info, 'c');
    expect(fn).toHaveBeenCalledTimes(3);
    memoized(info, 'a');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does not cache errors', () => {
    let calls = 0;
    const memoized = memoize(
      (key: string) => {
        calls++;
        if (calls === 1) {
          throw new Error(`first call for ${key} fails`);
        }
        return calls;
      },
      { max: 10 },
    );

    expect(() => memoized('a')).toThrow('first call for a fails');
    expect(memoized('a')).toBe(2);
    expect(memoized('a')).toBe(2);
  });
});
