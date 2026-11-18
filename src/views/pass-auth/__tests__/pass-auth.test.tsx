import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PassAuth from '../pass-auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

// 31 zero bytes then 0x01: the secp256k1 private key `1`, whose Ethereum address is well known.
const PRIVATE_KEY_ONE_BASE64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=';
const BUILT_IN_ADDRESS = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
const PASS_WALLET_ADDRESS = '0x00000000000000000000000000000000000000AA';

const hookMocks = vi.hoisted(() => ({
  getEthWalletFromPkcPrivateKey: vi.fn(),
  setAccount: vi.fn(),
  useAccount: vi.fn(),
  validateEthWallet: vi.fn(),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => hookMocks);
vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
  useTranslation: () => ({ t: (key: string, options?: { address?: string }) => (options?.address ? `${key}:${options.address}` : key) }),
}));
vi.mock('../../../components/home-logo', () => ({ default: () => null }));

const builtInWallet = { address: BUILT_IN_ADDRESS, timestamp: 1, signature: { signature: '0xbuiltin', type: 'eip191' } };
const deviceAccount = {
  id: 'device',
  author: { address: '12D3KooWKey', wallets: { eth: builtInWallet } },
  signer: { privateKey: PRIVATE_KEY_ONE_BASE64 },
};

let root: Root;
let container: HTMLDivElement;

const render = () => act(() => root.render(<MemoryRouter>{<PassAuth />}</MemoryRouter>));

const setInputValue = (selector: string, value: string) => {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const submit = async () => {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

describe('PassAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.useAccount.mockReturnValue(deviceAccount);
    hookMocks.setAccount.mockResolvedValue(undefined);
    hookMocks.validateEthWallet.mockResolvedValue(undefined);
    hookMocks.getEthWalletFromPkcPrivateKey.mockResolvedValue(builtInWallet);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the login form, with the message to sign, while only the device wallet is present', () => {
    render();

    expect(container.querySelector('form')).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('#pass-auth-message')?.value).toMatch(
      /^\{"domainSeparator":"pkc-author-wallet","authorAddress":"12D3KooWKey","timestamp":\d+\}$/,
    );
    expect(container.textContent).not.toContain('pass_auth_logged_in');
  });

  it('rejects something that is not a wallet address before checking the signature', async () => {
    render();
    act(() => setInputValue('#pass-auth-wallet', 'vitalik.eth'));
    act(() => setInputValue('#pass-auth-signature', '0xsig'));

    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('pass_auth_invalid_address');
    expect(hookMocks.validateEthWallet).not.toHaveBeenCalled();
    expect(hookMocks.setAccount).not.toHaveBeenCalled();
  });

  it('does not log in with a signature that does not match the wallet', async () => {
    hookMocks.validateEthWallet.mockRejectedValue(new Error('wallet address does not equal signature address'));
    render();
    act(() => setInputValue('#pass-auth-wallet', PASS_WALLET_ADDRESS));
    act(() => setInputValue('#pass-auth-signature', '0xwrong'));

    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('pass_auth_invalid_signature');
    expect(hookMocks.setAccount).not.toHaveBeenCalled();
  });

  it('stores the wallet with its proof once the signature checks out', async () => {
    render();
    const message = container.querySelector<HTMLTextAreaElement>('#pass-auth-message')!.value;
    const timestamp = (JSON.parse(message) as { timestamp: number }).timestamp;
    act(() => setInputValue('#pass-auth-wallet', ` ${PASS_WALLET_ADDRESS} `));
    act(() => setInputValue('#pass-auth-signature', '0xsig'));

    await submit();

    const wallet = { address: PASS_WALLET_ADDRESS, timestamp, signature: { signature: '0xsig', type: 'eip191' } };
    expect(hookMocks.validateEthWallet).toHaveBeenCalledWith(wallet, '12D3KooWKey');
    expect(hookMocks.setAccount).toHaveBeenCalledWith({ ...deviceAccount, author: { ...deviceAccount.author, wallets: { eth: wallet } } });
  });

  it('shows the logged in wallet, and logging out puts the device wallet back', async () => {
    const loggedInAccount = {
      ...deviceAccount,
      author: { ...deviceAccount.author, wallets: { eth: { address: PASS_WALLET_ADDRESS, timestamp: 2, signature: { signature: '0xsig', type: 'eip191' } } } },
    };
    hookMocks.useAccount.mockReturnValue(loggedInAccount);
    render();

    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain(`pass_auth_logged_in:${PASS_WALLET_ADDRESS}`);

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'log_out')!
        .click();
    });

    expect(hookMocks.getEthWalletFromPkcPrivateKey).toHaveBeenCalledWith(PRIVATE_KEY_ONE_BASE64, '12D3KooWKey');
    expect(hookMocks.setAccount).toHaveBeenCalledWith({ ...loggedInAccount, author: { ...loggedInAccount.author, wallets: { eth: builtInWallet } } });
  });
});
