import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSignTripcode from '../use-sign-tripcode';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({ createTripcodePublishOptionsMock: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../lib/tripcode-crypto', () => ({ createTripcodePublishOptions: testState.createTripcodePublishOptionsMock }));

let container: HTMLDivElement;
let root: Root;
let signTripcode: ReturnType<typeof useSignTripcode>;

const HookHarness = () => {
  signTripcode = useSignTripcode();
  return null;
};

describe('useSignTripcode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(HookHarness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('signs again when the options change while the key is derived, and saves the latest', async () => {
    let options = { communityAddress: 'board.bso', content: 'first' };
    testState.createTripcodePublishOptionsMock.mockImplementation(async ({ publishOptions }: { publishOptions: { content: string } }) => {
      // An edit while the first key derivation runs.
      if (publishOptions.content === 'first') options = { communityAddress: 'board.bso', content: 'edited' };
      return { displayName: `Anon#proof-for-${publishOptions.content}`, timestamp: 1 };
    });
    const writeOptions = vi.fn();

    await expect(signTripcode({ secret: { normal: 'pw' }, readOptions: () => options, writeOptions, isActive: () => true })).resolves.toBe(true);
    expect(testState.createTripcodePublishOptionsMock).toHaveBeenCalledTimes(2);
    expect(writeOptions).toHaveBeenCalledWith({ communityAddress: 'board.bso', content: 'edited', displayName: 'Anon#proof-for-edited', timestamp: 1 });
  });

  it('saves nothing once the publish was dropped', async () => {
    let active = true;
    testState.createTripcodePublishOptionsMock.mockImplementation(async () => {
      active = false;
      return { displayName: 'Anon#proof', timestamp: 1 };
    });
    const writeOptions = vi.fn();
    const options = { content: 'body' };

    await expect(signTripcode({ secret: { normal: 'pw' }, readOptions: () => options, writeOptions, isActive: () => active })).resolves.toBe(false);
    expect(writeOptions).not.toHaveBeenCalled();
  });

  it('rejects with the form message when the proof cannot be signed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    testState.createTripcodePublishOptionsMock.mockRejectedValue(new Error('board_not_loaded'));
    const options = { content: 'body' };

    await expect(signTripcode({ secret: { normal: 'pw' }, readOptions: () => options, writeOptions: vi.fn(), isActive: () => true })).rejects.toThrow(
      'error: tripcode_sign_failed',
    );
  });
});
