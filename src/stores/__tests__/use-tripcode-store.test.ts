import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useTripcodeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('keeps each account tripcode on this device and removes it when cleared', async () => {
    const useTripcodeStore = (await import('../use-tripcode-store')).default;

    useTripcodeStore.getState().setTripcodeInput('account-1', '#hunter2');
    useTripcodeStore.getState().setTripcodeInput('account-2', '##swordfish');
    expect(useTripcodeStore.getState().inputs).toEqual({ 'account-1': '#hunter2', 'account-2': '##swordfish' });
    expect(JSON.parse(localStorage.getItem('tripcode-inputs') ?? '{}').state.inputs['account-1']).toBe('#hunter2');

    useTripcodeStore.getState().setTripcodeInput('account-1', undefined);
    expect(useTripcodeStore.getState().inputs).toEqual({ 'account-2': '##swordfish' });
  });
});
