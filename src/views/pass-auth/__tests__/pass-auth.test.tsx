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
// The BSIP-22 test vector (BSIPs assets/bsip-22/wallet-proof-vectors.json). Test keys only.
const KEY_ADDRESS = '12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5';
const PASS_WALLET_ADDRESS = '0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c';
const PASS_TIMESTAMP = 1790000000;
const PASS_SIGNATURE = '0xfc705f790e2744d8acbec610783ce999e253392b9699cef1c20b338648a5aa132b8e6f5f836d314ad173ec97bb453d8a2df2fd1207ced2263f5701bdad17f0e31c';

const hookMocks = vi.hoisted(() => ({
  getEthWalletFromPkcPrivateKey: vi.fn(),
  setAccount: vi.fn(),
  useAccount: vi.fn(),
  validateEthWallet: vi.fn(),
}));

// Account writes and the async validator are mocked; the message is the real BSIP-22 code, from its own entry point.
vi.mock('@bitsocial/bitsocial-react-hooks', () => hookMocks);
vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
  useTranslation: () => ({ t: (key: string, options?: { address?: string }) => (options?.address ? `${key}:${options.address}` : key) }),
}));
vi.mock('../../../components/home-logo', () => ({ default: () => null }));

const builtInWallet = { address: BUILT_IN_ADDRESS, timestamp: 1, signature: { signature: '0xbuiltin', type: 'eip191' } };
const deviceAccount = {
  id: 'device',
  author: { address: 'name.bso', wallets: { eth: builtInWallet } },
  signer: { privateKey: PRIVATE_KEY_ONE_BASE64, address: KEY_ADDRESS },
};
const createLoggedInAccount = (signature: string) => ({
  ...deviceAccount,
  author: { ...deviceAccount.author, wallets: { eth: { address: PASS_WALLET_ADDRESS, timestamp: PASS_TIMESTAMP, signature: { signature, type: 'eip191' } } } },
});

let root: Root;
let container: HTMLDivElement;

const render = () => act(() => root.render(<MemoryRouter>{<PassAuth />}</MemoryRouter>));

const getMessage = () => container.querySelector<HTMLTextAreaElement>('#pass-auth-message')?.value;

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

const clickButton = async (label: string) => {
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === label)!
      .click();
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

  it('shows the BSIP-22 message to sign once a wallet address is entered, while only the device wallet is present', () => {
    render();

    expect(container.querySelector('form')).not.toBeNull();
    expect(container.textContent).not.toContain('pass_auth_logged_in');
    expect(getMessage()).toBe('');

    act(() => setInputValue('#pass-auth-wallet', ` ${PASS_WALLET_ADDRESS} `));

    // Signed over the key address, not author.address, and the wallet address in lowercase.
    expect(getMessage()).toMatch(
      new RegExp(
        `^\\{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"${KEY_ADDRESS}","walletAddress":"${PASS_WALLET_ADDRESS.toLowerCase()}","timestamp":\\d+\\}$`,
      ),
    );
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
    hookMocks.validateEthWallet.mockRejectedValue(new Error('validateEthWallet invalid wallet: signature does not recover the wallet address'));
    render();
    act(() => setInputValue('#pass-auth-wallet', PASS_WALLET_ADDRESS));
    act(() => setInputValue('#pass-auth-signature', '0xwrong'));

    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('pass_auth_invalid_signature');
    expect(hookMocks.setAccount).not.toHaveBeenCalled();
  });

  it('stores the wallet with its proof once the signature checks out against the key address', async () => {
    render();
    act(() => setInputValue('#pass-auth-wallet', ` ${PASS_WALLET_ADDRESS} `));
    act(() => setInputValue('#pass-auth-signature', '0xsig'));
    const timestamp = (JSON.parse(getMessage()!) as { timestamp: number }).timestamp;

    await submit();

    const wallet = { address: PASS_WALLET_ADDRESS, timestamp, signature: { signature: '0xsig', type: 'eip191' } };
    expect(hookMocks.validateEthWallet).toHaveBeenCalledWith(wallet, KEY_ADDRESS);
    expect(hookMocks.setAccount).toHaveBeenCalledWith({ ...deviceAccount, author: { ...deviceAccount.author, wallets: { eth: wallet } } });
  });

  it('shows the logged in wallet, and logging out puts the device wallet back', async () => {
    const loggedInAccount = createLoggedInAccount(PASS_SIGNATURE);
    hookMocks.useAccount.mockReturnValue(loggedInAccount);
    render();

    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain(`pass_auth_logged_in:${PASS_WALLET_ADDRESS}`);

    await clickButton('log_out');

    expect(hookMocks.getEthWalletFromPkcPrivateKey).toHaveBeenCalledWith(PRIVATE_KEY_ONE_BASE64);
    expect(hookMocks.setAccount).toHaveBeenCalledWith({ ...loggedInAccount, author: { ...loggedInAccount.author, wallets: { eth: builtInWallet } } });
  });
});
