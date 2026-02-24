import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountSettings from '../account-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
}));

vi.mock('@plebbit/plebbit-react-hooks', () => ({
  useAccount: () => ({ id: 'test-id', name: 'Account 1', author: { address: '0x123', shortAddress: '0x1...3' } }),
  useAccounts: () => ({ accounts: [{ id: 'test-id', name: 'Account 1', author: { shortAddress: '0x1...3' } }] }),
  createAccount: vi.fn(),
  deleteAccount: vi.fn(),
  exportAccount: vi.fn(),
  importAccount: vi.fn(),
  setActiveAccount: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web' },
}));

let root: Root;
let container: HTMLDivElement;

const render = (children: React.ReactNode) => {
  act(() => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/subs/settings'] }, children));
  });
};

describe('AccountSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not render an inline textarea', () => {
    render(createElement(AccountSettings));
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('does not render save_changes or reset_changes buttons', () => {
    render(createElement(AccountSettings));
    const buttons = Array.from(container.querySelectorAll('button'));
    const buttonTexts = buttons.map((b) => b.textContent ?? '');
    expect(buttonTexts.some((t) => t.includes('save_changes'))).toBe(false);
    expect(buttonTexts.some((t) => t.includes('reset_changes'))).toBe(false);
  });

  it('renders an edit button', () => {
    render(createElement(AccountSettings));
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => (b.textContent ?? '').includes('edit'))).toBe(true);
  });

  it('renders create, import, export buttons', () => {
    render(createElement(AccountSettings));
    const buttons = Array.from(container.querySelectorAll('button'));
    const texts = buttons.map((b) => b.textContent ?? '');
    expect(texts.some((t) => t.includes('create'))).toBe(true);
    expect(texts.some((t) => t.includes('import'))).toBe(true);
    expect(texts.some((t) => t.includes('export'))).toBe(true);
  });

  it('renders delete_account button', () => {
    render(createElement(AccountSettings));
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => (b.textContent ?? '').includes('delete_account'))).toBe(true);
  });
});
