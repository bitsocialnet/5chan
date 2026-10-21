import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePromiseResult } from '../use-promise-result';

const results: Array<{ value: string } | undefined> = [];

const Probe = ({ promise }: { promise: Promise<string> | undefined }) => {
  results.push(usePromiseResult(promise));
  return null;
};

describe('usePromiseResult', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    results.length = 0;
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it('renders without a result while the promise is pending, then with what it resolved to', async () => {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((resolvePromise) => {
      resolve = resolvePromise;
    });

    await act(async () => root.render(createElement(Probe, { promise })));
    expect(results.at(-1)).toBeUndefined();

    await act(async () => resolve('snapshot'));
    expect(results.at(-1)).toEqual({ value: 'snapshot' });
  });

  it('reads a promise that already resolved for an earlier render synchronously', async () => {
    const promise = Promise.resolve('snapshot');
    await act(async () => root.render(createElement(Probe, { promise })));
    await act(async () => root.render(null));
    results.length = 0;

    act(() => root.render(createElement(Probe, { promise })));

    expect(results[0]).toEqual({ value: 'snapshot' });
  });

  it('has no result without a promise', async () => {
    await act(async () => root.render(createElement(Probe, { promise: undefined })));

    expect(results.at(-1)).toBeUndefined();
  });
});
