import { FRAMES_SIDEBAR_WIDTH } from '../constants/frames';
import { useFramesEnabled } from './use-frames';
import useWindowWidth from './use-window-width';

const useContentWidth = () => {
  const windowWidth = useWindowWidth();
  const framesEnabled = useFramesEnabled();
  return windowWidth - (framesEnabled ? FRAMES_SIDEBAR_WIDTH : 0);
};

export default useContentWidth;
