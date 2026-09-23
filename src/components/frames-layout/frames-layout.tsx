import type { CSSProperties, ReactNode } from 'react';
import { FRAMES_SIDEBAR_WIDTH } from '../../constants/frames';
import { useFramesEnabled } from '../../hooks/use-frames';
import FramesSidebar from '../frames-sidebar';
import styles from './frames-layout.module.css';

const FramesLayout = ({ children }: { children: ReactNode }) => {
  const enabled = useFramesEnabled();

  return (
    <div
      className={styles.layout}
      data-frames-enabled={enabled || undefined}
      style={{ '--frames-sidebar-width': enabled ? `${FRAMES_SIDEBAR_WIDTH}px` : '0px' } as CSSProperties}
    >
      {enabled && <FramesSidebar />}
      <div className={styles.content}>{children}</div>
    </div>
  );
};

export default FramesLayout;
