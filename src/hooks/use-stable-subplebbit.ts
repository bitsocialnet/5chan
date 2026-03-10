import useSubplebbitsStore from '@bitsocialnet/bitsocial-react-hooks/dist/stores/subplebbits';
import { normalizeBoardAddress } from './use-directories';

const getSubplebbitByAddress = (subplebbits: Record<string, any> | undefined, subplebbitAddress: string | undefined) => {
  if (!subplebbits || !subplebbitAddress) {
    return undefined;
  }

  const exactMatch = subplebbits[subplebbitAddress];
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedAddress = normalizeBoardAddress(subplebbitAddress);
  return Object.entries(subplebbits).find(([key, subplebbit]) => {
    const candidateAddress = typeof subplebbit?.address === 'string' ? subplebbit.address : key;
    return normalizeBoardAddress(candidateAddress) === normalizedAddress;
  })?.[1];
};

/**
 * Shallow compare two objects by keys and values.
 */
const shallowEqual = (obj1: Record<string, any> | undefined, obj2: Record<string, any> | undefined): boolean => {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return obj1 === obj2;
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  return true;
};

/**
 * Custom equality function that ignores transient state properties
 * like updatingState, state, errors, etc. Only compares stable content fields.
 */
const isSubplebbitEqual = (prev: any, next: any): boolean => {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;

  // Compare only stable fields, ignore transient state
  // Use shallow comparison for roles object to handle new object instances with same content
  return (
    prev.address === next.address &&
    prev.title === next.title &&
    prev.shortAddress === next.shortAddress &&
    shallowEqual(prev.roles, next.roles) &&
    prev.updatedAt === next.updatedAt &&
    prev.createdAt === next.createdAt &&
    prev.description === next.description
  );
};

/**
 * Hook to get a subplebbit with stable reference that ignores updatingState changes.
 * Use this when you only need content fields and don't care about loading states.
 *
 * @param subplebbitAddress - The address of the subplebbit to retrieve
 * @returns The subplebbit object, or undefined if not found
 */
export const useStableSubplebbit = (subplebbitAddress: string | undefined) => {
  // Use selector with custom equality to ignore transient state
  const subplebbit = useSubplebbitsStore((state) => getSubplebbitByAddress(state.subplebbits, subplebbitAddress), isSubplebbitEqual);

  return subplebbit;
};

/**
 * Hook to get only specific fields from a subplebbit, ignoring updatingState.
 * This is more efficient when you only need a few fields.
 *
 * @param subplebbitAddress - The address of the subplebbit
 * @param selector - Function to extract the needed fields
 * @returns The selected fields
 */
export const useSubplebbitField = <T>(subplebbitAddress: string | undefined, selector: (subplebbit: any) => T): T | undefined => {
  const field = useSubplebbitsStore(
    (state) => {
      const subplebbit = getSubplebbitByAddress(state.subplebbits, subplebbitAddress);
      return subplebbit ? selector(subplebbit) : undefined;
    },
    (prev, next) => prev === next,
  );

  return field;
};
