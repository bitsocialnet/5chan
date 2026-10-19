import type { NameResolver, PubsubVoterOptions } from '@bitsocial/pubsub-voting';

type HeliaNode = PubsubVoterOptions['helia'];

interface BrowserLibp2pAccount {
  pkc?: {
    nameResolvers?: NameResolver[];
    clients?: {
      libp2pJsClients?: {
        libp2pjs?: {
          heliaNode?: HeliaNode;
        };
      };
    };
  };
}

export const getBrowserHeliaNode = (account: unknown): HeliaNode | undefined => {
  if (!account || typeof account !== 'object') return undefined;
  return (account as BrowserLibp2pAccount).pkc?.clients?.libp2pJsClients?.libp2pjs?.heliaNode;
};

export const getBrowserNameResolvers = (account: unknown): NameResolver[] | undefined => {
  if (!account || typeof account !== 'object') return undefined;
  return (account as BrowserLibp2pAccount).pkc?.nameResolvers;
};
