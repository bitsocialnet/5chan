import { useEffect, useState } from 'react';
import useThreadLiveUpdatesStore from '../../stores/use-thread-live-updates-store';
import styles from './spooky-skeleton.module.css';

// A port of 4chan's Halloween skeleton (fc_skelrot on its board and thread pages): one of its 23
// skeleton GIFs, or rarely a dinosaur, in the bottom right corner or upside down in the top right.
const SKELETON_COUNT = 23;

interface Skeleton {
  id: number;
  src: string;
  isTop: boolean;
}

const pickSkeleton = (id: number): Skeleton => ({
  id,
  src: Math.random() < 0.01 ? 'assets/skeletons/dinosaur.gif' : `assets/skeletons/${1 + Math.floor(Math.random() * SKELETON_COUNT)}.gif`,
  isTop: Math.random() < 0.25,
});

const SpookySkeleton = () => {
  const [skeleton, setSkeleton] = useState(() => pickSkeleton(0));

  // Like 4chan, a thread update that brings new posts replaces the skeleton two times out of three.
  useEffect(
    () =>
      useThreadLiveUpdatesStore.subscribe((state, previousState) => {
        if (state.updatesWithNewPosts > previousState.updatesWithNewPosts && Math.random() >= 0.33) {
          setSkeleton((current) => pickSkeleton(current.id + 1));
        }
      }),
    [],
  );

  // The key mounts a new image for each pick, so it fades in again as 4chan's replacement does.
  return <img key={skeleton.id} className={`${styles.skeleton} ${skeleton.isTop ? styles.top : ''}`} src={skeleton.src} alt='' />;
};

export default SpookySkeleton;
