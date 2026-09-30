import { createContext, useContext } from 'react';

// Set by a thread whose replies are all loaded (see getCompleteThreadCids), so its replies can tell a
// purged quote target from one that is not loaded yet. Nested quote-preview posts inherit it.
export const CompleteThreadCidsContext = createContext<ReadonlySet<string> | undefined>(undefined);

// Only a reply inside the loaded thread may use its cids: everything that reply quotes is older than
// it, so it is in the same copy of the thread unless purged. A newer reply (for example the user's
// own, appended to an older copy) could quote a reply that copy does not have yet.
export const useCompleteThreadCids = (postCid?: string, cid?: string) => {
  const completeThreadCids = useContext(CompleteThreadCidsContext);
  return postCid && cid && completeThreadCids?.has(postCid) && completeThreadCids.has(cid) ? completeThreadCids : undefined;
};
