import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountDataEditor from '../account-data-editor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
}));

vi.mock('../../../lib/utils/account-editor-utils', () => ({
  buildEditableAccountJson: () => '{"account": {"name": "test"}}',
  safeParseAccountJson: vi.fn((text: string) => {
    try {
      const p = JSON.parse(text);
      return p?.account ? p : null;
    } catch {
      return null;
    }
  }),
  buildSavePayload: vi.fn((parsed: { account: Record<string, unknown> }, id: string) => ({ ...parsed.account, id })),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks', () => ({
  useAccount: () => ({ id: 'test-id', name: 'Account 1', author: { address: '0x123', shortAddress: '0x1...3' } }),
  setAccount: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;

const render = (children: React.ReactNode) => {
  act(() => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/settings/account-data'] }, children));
  });
};

describe('AccountDataEditor', () => {
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

  it('renders warning gate initially', () => {
    render(createElement(AccountDataEditor));
    expect(container.textContent).toContain('private_key_warning_title');
  });

  it('shows go_back and continue buttons in warning gate', () => {
    render(createElement(AccountDataEditor));
    const buttons = Array.from(container.querySelectorAll('button'));
    const texts = buttons.map((b) => b.textContent ?? '');
    expect(texts.some((t) => t.includes('go_back'))).toBe(true);
    expect(texts.some((t) => t.includes('continue'))).toBe(true);
  });

  it('does not show editor controls in warning phase', () => {
    render(createElement(AccountDataEditor));
    const buttons = Array.from(container.querySelectorAll('button'));
    const texts = buttons.map((b) => b.textContent ?? '');
    expect(texts.some((t) => t.includes('save'))).toBe(false);
    expect(texts.some((t) => t.includes('reset_changes'))).toBe(false);
    expect(texts.some((t) => t.includes('return_to_settings'))).toBe(false);
  });
});
