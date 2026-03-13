import useSubplebbitStore from './use-communities-loading-start-timestamps-store';

const useSubplebbitLoadingStartTimestamps = (subplebbitAddresses?: string[]) => {
  const addLegacyInput = subplebbitAddresses?.map((address) => address);
  return useSubplebbitStore(addLegacyInput);
};

export default useSubplebbitLoadingStartTimestamps;
