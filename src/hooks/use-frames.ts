import { useSyncExternalStore } from 'react';
import { FRAMES_DESKTOP_QUERY } from '../constants/frames';
import useFramesStore from '../stores/use-frames-store';

const subscribe = (listener: () => void) => {
  const media = window.matchMedia?.(FRAMES_DESKTOP_QUERY);
  if (!media) return () => {};
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const getSnapshot = () => window.matchMedia?.(FRAMES_DESKTOP_QUERY).matches ?? false;
const getServerSnapshot = () => false;

export const useFramesAvailable = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export const useFramesEnabled = () => {
  const available = useFramesAvailable();
  const useFrames = useFramesStore((state) => state.useFrames);
  return available && useFrames;
};
