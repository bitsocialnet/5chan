import { createContext, useContext } from 'react';

// Cached feeds stay mounted while the router moves to another board or a thread.
export const FeedCacheContext = createContext(false);

export const useFeedCacheContext = () => useContext(FeedCacheContext);
