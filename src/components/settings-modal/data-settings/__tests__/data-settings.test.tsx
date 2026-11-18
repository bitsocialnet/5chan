import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTripcodeStore from '../../../../stores/use-tripcode-store';
import DataSettings from '../data-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;
const LEGACY_DEFAULT_HTTP_ROUTERS = ['https://routing.lol', 'https://peers.pleb.bot', 'https://peers.plebpubsub.xyz', 'https://peers.forumindex.com'];

const hookMocks = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  exportAccount: vi.fn(),
  importAccount: vi.fn(),
  setActiveAccount: vi.fn(),
  useAccount: vi.fn(),
  useAccounts: vi.fn(),
}));

const tripcodeCryptoMocks = vi.hoisted(() => ({ forgetTripcodeKeys: vi.fn() }));
const clipboardMocks = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));

vi.mock('../../../../lib/utils/clipboard-utils', () => ({ copyToClipboard: clipboardMocks.copyToClipboard }));

vi.mock('../../../../lib/tripcode-crypto', () => ({ forgetTripcodeKeys: tripcodeCryptoMocks.forgetTripcodeKeys }));

const fileReaderState = vi.hoisted(() => ({
  result: '',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: hookMocks.useAccount,
  useAccounts: hookMocks.useAccounts,
  deleteAccount: hookMocks.deleteAccount,
  exportAccount: hookMocks.exportAccount,
  importAccount: hookMocks.importAccount,
  setActiveAccount: hookMocks.setActiveAccount,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
}));

class MockFileReader {
  onload: ((event: { target: { result: unknown } }) => void) | null = null;

  readAsText() {
    this.onload?.({ target: { result: fileReaderState.result } });
  }
}

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid='location'>{location.pathname + location.search + location.hash}</div>;
};

let root: Root;
let container: HTMLDivElement;
let alertSpy: ReturnType<typeof vi.spyOn>;
let confirmSpy: ReturnType<typeof vi.spyOn>;
let createElementSpy: ReturnType<typeof vi.spyOn>;
let anchorClickSpy: ReturnType<typeof vi.spyOn>;
let inputClickSpy: ReturnType<typeof vi.spyOn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let createdInput: HTMLInputElement | null;
let createdAnchor: HTMLAnchorElement | null;
let createObjectUrlSpy: ReturnType<typeof vi.fn>;
let revokeObjectUrlSpy: ReturnType<typeof vi.fn>;
const originalLocation = window.location;
let reloadMock: ReturnType<typeof vi.fn>;

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const render = (initialEntry = '/subs/settings') => {
  act(() => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [initialEntry] }, createElement(React.Fragment, {}, createElement(DataSettings), createElement(LocationProbe))),
    );
  });
};

const getButtons = () => Array.from(container.querySelectorAll('button'));

const getButtonByText = (text: string) => {
  const button = getButtons().find((candidate) => (candidate.textContent ?? '').includes(text));
  if (!button) {
    throw new Error(`Button containing "${text}" not found`);
  }
  return button;
};

const getLocationText = () => container.querySelector('[data-testid="location"]')?.textContent ?? '';

const selectImportFile = (file: File) => {
  const input = createdInput as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
};

describe('DataSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fileReaderState.result = '';
    createdInput = null;
    createdAnchor = null;

    hookMocks.useAccount.mockReturnValue({
      id: 'test-id',
      name: 'Account 1',
      author: { address: '0x123', shortAddress: '0x1...3' },
      signer: { address: '12D3KooWSigner' },
      subscriptions: ['business.eth'],
    });
    hookMocks.useAccounts.mockReturnValue({
      accounts: [{ id: 'test-id', name: 'Account 1', author: { shortAddress: '0x1...3' } }],
      state: 'succeeded',
    });

    createObjectUrlSpy = vi.fn(() => 'blob:test-account');
    revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrlSpy,
    });

    vi.stubGlobal('FileReader', MockFileReader);

    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        reload: reloadMock,
      },
    });

    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName === 'input') {
        createdInput = element as HTMLInputElement;
      }
      if (tagName === 'a') {
        createdAnchor = element as HTMLAnchorElement;
      }
      return element;
    }) as typeof document.createElement);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    container?.remove();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    alertSpy?.mockRestore();
    confirmSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    anchorClickSpy?.mockRestore();
    inputClickSpy?.mockRestore();
    createElementSpy?.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders the backup actions without inline editor controls or the word account', () => {
    render();
    expect(container.querySelector('textarea')).toBeNull();

    const buttonTexts = getButtons().map((button) => button.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('save_changes'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('reset_changes'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('edit_raw_data'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('copy_bitsocial_identifier'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('download_backup'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('import_backup'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('delete_local_data'))).toBe(true);
    expect(container.textContent?.toLowerCase()).not.toContain('account');
  });

  it('disables importing until the hooks account store is ready', () => {
    hookMocks.useAccounts.mockReturnValue({ accounts: [], state: 'initializing' });

    render();

    expect(getButtonByText('import_backup').disabled).toBe(true);
  });

  it('says the data is stored only on this device', () => {
    render();

    expect(container.textContent).toContain('local_data_info');
  });

  it('shows no picker while the device holds a single copy of its data', () => {
    render();

    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent).not.toContain('several_backups_tip');
  });

  it('lets a device with an imported backup choose which copy is active', async () => {
    hookMocks.useAccounts.mockReturnValue({
      accounts: [
        { id: 'test-id', name: 'Account 1', author: { shortAddress: '0x1...3' } },
        { id: 'imported-id', name: 'Imported', author: { shortAddress: '0x9...9' } },
      ],
      state: 'succeeded',
    });

    render();

    const select = container.querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['0x1...3', '0x9...9']);
    expect(container.textContent).toContain('several_backups_tip');

    await act(async () => {
      select.value = 'Imported';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(hookMocks.setActiveAccount).toHaveBeenCalledWith('Imported');
  });

  it("copies the key's identifier, which is what a board owner whitelists", async () => {
    clipboardMocks.copyToClipboard.mockResolvedValue(undefined);

    render();

    expect(container.textContent).toContain('bitsocial_identifier_tip');
    await act(async () => {
      getButtonByText('copy_bitsocial_identifier').click();
      await Promise.resolve();
    });

    expect(clipboardMocks.copyToClipboard).toHaveBeenCalledWith('12D3KooWSigner');
    expect(getButtonByText('copied')).toBeTruthy();
  });

  it('deletes the local data only after both confirmations succeed', async () => {
    confirmSpy.mockReturnValueOnce(true).mockReturnValueOnce(true);

    render();

    await act(async () => {
      getButtonByText('delete_local_data').click();
    });

    expect(hookMocks.deleteAccount).toHaveBeenCalledWith('Account 1');
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(confirmSpy).toHaveBeenNthCalledWith(1, 'delete_local_data_confirm');
  });

  it("removes the deleted data's tripcode and the keys derived from it", async () => {
    useTripcodeStore.getState().setTripcodeInput('test-id', '#hunter2##swordfish');
    confirmSpy.mockReturnValueOnce(true).mockReturnValueOnce(true);

    render();

    await act(async () => {
      getButtonByText('delete_local_data').click();
    });

    expect(useTripcodeStore.getState().inputs['test-id']).toBeUndefined();
    await vi.waitFor(() => expect(tripcodeCryptoMocks.forgetTripcodeKeys).toHaveBeenCalledWith('#hunter2##swordfish'));
  });

  it('does not delete the local data when the first confirmation is rejected', async () => {
    confirmSpy.mockReturnValueOnce(false);

    render();

    await act(async () => {
      getButtonByText('delete_local_data').click();
    });

    expect(hookMocks.deleteAccount).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('exports a formatted backup download', async () => {
    hookMocks.exportAccount.mockResolvedValue(JSON.stringify({ account: { name: 'Account 1' } }));

    render();

    await act(async () => {
      getButtonByText('download_backup').click();
      await Promise.resolve();
    });

    expect(hookMocks.exportAccount).toHaveBeenCalledOnce();
    expect(createObjectUrlSpy).toHaveBeenCalledOnce();
    expect(anchorClickSpy).toHaveBeenCalledOnce();
    expect(createdAnchor?.download).toBe('5chan-backup.json');
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:test-account');
  });

  it('alerts when export returns malformed JSON', async () => {
    hookMocks.exportAccount.mockResolvedValue('not-json');

    render();

    await act(async () => {
      getButtonByText('download_backup').click();
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('Failed to parse backup');
    expect(createObjectUrlSpy).not.toHaveBeenCalled();
  });

  it('alerts when exportAccount throws', async () => {
    hookMocks.exportAccount.mockRejectedValue(new Error('export failed'));

    render();

    await act(async () => {
      getButtonByText('download_backup').click();
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('export failed');
    expect(createObjectUrlSpy).not.toHaveBeenCalled();
  });

  it('ignores a cancelled import picker', async () => {
    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    expect(createdInput).not.toBeNull();
    expect(inputClickSpy).toHaveBeenCalledOnce();

    await act(async () => {
      createdInput?.dispatchEvent(new Event('cancel'));
      await Promise.resolve();
    });

    expect(createdInput?.isConnected).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(hookMocks.importAccount).not.toHaveBeenCalled();
  });

  it('still imports a file chosen after the window regains focus', async () => {
    fileReaderState.result = JSON.stringify({ account: { name: 'Imported', author: { address: '0x999' } } });
    hookMocks.importAccount.mockResolvedValue(undefined);
    hookMocks.setActiveAccount.mockResolvedValue(undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    try {
      render();

      await act(async () => {
        getButtonByText('import_backup').click();
      });

      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(2000);
      expect(createdInput?.isConnected).toBe(true);

      await act(async () => {
        selectImportFile(new File(['{}'], 'account.json', { type: 'application/json' }));
        await Promise.resolve();
      });
      await flushMicrotasks();

      expect(hookMocks.importAccount).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('alerts when the imported file contains invalid JSON', async () => {
    fileReaderState.result = '{bad json';
    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    const file = new File(['{}'], 'account.json', { type: 'application/json' });
    await act(async () => {
      selectImportFile(file);
    });

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse backup:'));
    expect(hookMocks.importAccount).not.toHaveBeenCalled();
  });

  it('imports a backup, merges owned boards into subscriptions, and redirects back to advanced settings', async () => {
    fileReaderState.result = JSON.stringify({
      account: {
        name: 'Imported',
        author: { address: '0x999' },
        subscriptions: ['business.eth'],
        communities: {
          'business.eth': { title: '/biz/' },
          'music-posting.bso': { title: '/mu/' },
        },
      },
    });
    hookMocks.importAccount.mockResolvedValue(undefined);
    hookMocks.setActiveAccount.mockResolvedValue(undefined);

    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    // WebKit can garbage-collect a detached input while its picker is open, dropping the selection (#516).
    expect(createdInput?.isConnected).toBe(true);
    expect(createdInput?.accept).toBe('.json');

    const file = new File(['{}'], 'account.json', { type: 'application/json' });
    await act(async () => {
      selectImportFile(file);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(createdInput?.isConnected).toBe(false);
    expect(hookMocks.importAccount).toHaveBeenCalledOnce();
    const importedPayload = JSON.parse(hookMocks.importAccount.mock.calls[0][0]);
    expect(importedPayload.account.subscriptions).toEqual(['business.eth', 'music-posting.bso']);
    expect(importedPayload.account.pkcOptions.httpRoutersOptions).toEqual(LEGACY_DEFAULT_HTTP_ROUTERS);
    expect(hookMocks.setActiveAccount).toHaveBeenCalledWith('Imported');
    expect(alertSpy).toHaveBeenCalledWith('backup_imported');
    expect(getLocationText()).toBe('/subs/settings?section=advanced-settings');
    expect(reloadMock).not.toHaveBeenCalled();
    expect(importedPayload.account.pkcOptions).toEqual(
      expect.objectContaining({
        httpRoutersOptions: LEGACY_DEFAULT_HTTP_ROUTERS,
        libp2pJsClientsOptions: [{ key: 'libp2pjs' }],
      }),
    );
  });

  it('preserves explicit HTTP routers when importing a backup', async () => {
    fileReaderState.result = JSON.stringify({
      account: {
        name: 'Imported',
        author: { address: '0x999' },
        pkcOptions: {
          httpRoutersOptions: ['https://router.custom.example'],
          ipfsGatewayUrls: ['https://gateway.custom.example'],
        },
      },
    });
    hookMocks.importAccount.mockResolvedValue(undefined);
    hookMocks.setActiveAccount.mockResolvedValue(undefined);

    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    const file = new File(['{}'], 'account.json', { type: 'application/json' });
    await act(async () => {
      selectImportFile(file);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const importedPayload = JSON.parse(hookMocks.importAccount.mock.calls[0][0]);
    expect(importedPayload.account.pkcOptions).toEqual(
      expect.objectContaining({
        httpRoutersOptions: ['https://router.custom.example'],
        libp2pJsClientsOptions: [{ key: 'libp2pjs' }],
      }),
    );
    expect(importedPayload.account.pkcOptions).not.toHaveProperty('ipfsGatewayUrls');
  });

  it('preserves an explicit empty HTTP routers list when importing a backup', async () => {
    fileReaderState.result = JSON.stringify({
      account: {
        name: 'Imported',
        author: { address: '0x999' },
        pkcOptions: {
          httpRoutersOptions: [],
          ipfsGatewayUrls: ['https://gateway.custom.example'],
        },
      },
    });
    hookMocks.importAccount.mockResolvedValue(undefined);
    hookMocks.setActiveAccount.mockResolvedValue(undefined);

    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    const file = new File(['{}'], 'account.json', { type: 'application/json' });
    await act(async () => {
      selectImportFile(file);
      await Promise.resolve();
    });
    await flushMicrotasks();

    const importedPayload = JSON.parse(hookMocks.importAccount.mock.calls[0][0]);
    expect(importedPayload.account.pkcOptions).toEqual(
      expect.objectContaining({
        httpRoutersOptions: [],
        libp2pJsClientsOptions: [{ key: 'libp2pjs' }],
      }),
    );
    expect(importedPayload.account.pkcOptions).not.toHaveProperty('ipfsGatewayUrls');
  });

  it('activates the imported copy when its stored name is already taken', async () => {
    hookMocks.useAccounts.mockReturnValue({
      accounts: [
        { id: 'test-id', name: 'Account 1', author: { shortAddress: '0x1...3' } },
        { id: 'existing-imported-id', name: 'Imported', author: { shortAddress: '0x9...9' } },
        { id: 'existing-imported-2-id', name: 'Imported 2', author: { shortAddress: '0x8...8' } },
      ],
      state: 'succeeded',
    });
    fileReaderState.result = JSON.stringify({
      account: {
        id: 'imported-id',
        name: 'Imported',
        author: { address: '0xabc' },
      },
    });
    hookMocks.importAccount.mockResolvedValue(undefined);
    hookMocks.setActiveAccount.mockResolvedValue(undefined);

    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    const file = new File(['{}'], 'account.json', { type: 'application/json' });
    await act(async () => {
      selectImportFile(file);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(hookMocks.importAccount).toHaveBeenCalledOnce();
    expect(hookMocks.setActiveAccount).toHaveBeenCalledWith('Imported 3');
    expect(alertSpy).toHaveBeenCalledWith('backup_imported');
  });

  it('surfaces import errors without navigating or reloading', async () => {
    fileReaderState.result = JSON.stringify({
      account: {
        name: 'Imported',
        author: { address: '0x999' },
      },
    });
    hookMocks.importAccount.mockRejectedValue(new Error('import failed'));

    render();

    await act(async () => {
      getButtonByText('import_backup').click();
    });

    const file = new File(['{}'], 'account.json', { type: 'application/json' });
    await act(async () => {
      selectImportFile(file);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(alertSpy).toHaveBeenCalledWith('import failed');
    expect(getLocationText()).toBe('/subs/settings');
  });
});
