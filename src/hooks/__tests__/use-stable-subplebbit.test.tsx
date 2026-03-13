import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStableSubplebbit, useSubplebbitField } from '../use-stable-subplebbit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  communities: {} as Record<string, unknown>,
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks/dist/stores/communities', () => ({
  default: (selector: (state: { communities: typeof testState.communities }) => unknown) =>
    selector({
      communities: testState.communities,
    }),
}));

let latestValue: unknown;
let container: HTMLDivElement;
let root: Root;
let renderCount = 0;

const HookHarness = ({ useValue }: { useValue: () => unknown }) => {
  latestValue = useValue();
  return null;
};

const renderHookValue = (useValue: () => unknown) => {
  act(() => {
    root.render(createElement(HookHarness, { key: renderCount++, useValue }));
  });

  return latestValue;
};

describe('use-stable-subplebbit', () => {
  beforeEach(() => {
    latestValue = undefined;
    renderCount = 0;
    testState.communities = {};

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('resolves alias board addresses when the store key uses a different suffix', () => {
    testState.communities = {
      'international-sfw.bso': {
        address: 'international-sfw.bso',
        roles: {
          'plebeius.eth': { role: 'owner' },
        },
        title: '/int/ - International',
      },
    };

    expect(renderHookValue(() => useSubplebbitField('international-sfw.eth', (subplebbit) => subplebbit?.roles))).toEqual({
      'plebeius.eth': { role: 'owner' },
    });

    expect(renderHookValue(() => useStableSubplebbit('international-sfw.eth'))).toMatchObject({
      address: 'international-sfw.bso',
      title: '/int/ - International',
    });
  });

  it('prefers an exact key match when both exact and alias variants are present', () => {
    testState.communities = {
      'business.eth': {
        address: 'business.eth',
        title: '/biz/ - Exact',
      },
      'business.bso': {
        address: 'business.bso',
        title: '/biz/ - Alias',
      },
    };

    expect(renderHookValue(() => useSubplebbitField('business.eth', (subplebbit) => subplebbit?.title))).toBe('/biz/ - Exact');
  });
});
