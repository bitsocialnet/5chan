import { PubsubVoter, type ChainClient, type ChainClientFactory, type NameResolver, type PubsubVoterOptions } from '@bitsocial/pubsub-voting';
import { createPublicClient, fallback, http } from 'viem';
import { baseSepolia, mainnet } from 'viem/chains';

export const BASE_SEPOLIA_VOTING_RPC_URLS = ['https://base-sepolia.drpc.org', 'https://sepolia.base.org', 'https://sepolia-preconf.base.org'] as const;
// Each endpoint must serve state a full vote-expiry window behind head (30 days); publicnode and
// cloudflare refuse those historical calls without a key, so they are deliberately absent.
export const ETHEREUM_VOTING_RPC_URLS = [
  'https://eth.drpc.org',
  'https://mainnet.gateway.tenderly.co',
  'https://1rpc.io/eth',
  'https://eth-mainnet.public.blastapi.io',
] as const;

const createVotingChainClient = (chain: typeof baseSepolia | typeof mainnet, urls: readonly string[]) =>
  createPublicClient({
    chain,
    transport: fallback(
      urls.map((url) => http(url, { retryCount: 0, timeout: 10_000 })),
      { retryCount: 1 },
    ),
  }) as ChainClient;

const votingChainClients = new Map<number, ChainClient>([
  [baseSepolia.id, createVotingChainClient(baseSepolia, BASE_SEPOLIA_VOTING_RPC_URLS)],
  [mainnet.id, createVotingChainClient(mainnet, ETHEREUM_VOTING_RPC_URLS)],
]);

/** Return the one shared client for a supported voting chain; unknown chains recuse. */
export const getVotingChainClient: ChainClientFactory = ({ chainId }) => votingChainClients.get(chainId);

/** Free testnet 5chan Pass faucet for the Base Sepolia test contests; one Pass per captcha. */
export const TESTNET_PASS_FAUCET_URL = 'https://testnet-5chan-pass.netlify.app/';

/** Testnet contests show their votes but must not reorder directories or pick homepage winners. */
export const isTestnetVotingChain = (chainId: number): boolean => chainId !== mainnet.id;

interface BrowserPubsubVoterOptions {
  helia: PubsubVoterOptions['helia'];
  nameResolvers?: NameResolver[];
}

/** Browser storage is persistent IndexedDB whenever dataPath is left enabled. */
export const createBrowserPubsubVoter = ({ helia, nameResolvers }: BrowserPubsubVoterOptions): PubsubVoter =>
  new PubsubVoter({
    helia,
    chains: getVotingChainClient,
    nameResolvers,
  });

const votersByHelia = new WeakMap<PubsubVoterOptions['helia'], Map<NameResolver[] | undefined, PubsubVoter>>();

/** Share one long-lived voter across every view using the same PKC node and resolvers. */
export const getOrCreateBrowserPubsubVoter = ({ helia, nameResolvers }: BrowserPubsubVoterOptions): PubsubVoter => {
  let votersByResolvers = votersByHelia.get(helia);
  if (!votersByResolvers) {
    votersByResolvers = new Map();
    votersByHelia.set(helia, votersByResolvers);
  }

  const existing = votersByResolvers.get(nameResolvers);
  if (existing) return existing;

  const voter = createBrowserPubsubVoter({ helia, nameResolvers });
  votersByResolvers.set(nameResolvers, voter);
  return voter;
};
