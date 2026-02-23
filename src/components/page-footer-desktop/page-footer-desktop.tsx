import BoardsBar from '../boardsbar';
import SiteLegalMeta from '../site-legal-meta';
import styles from './page-footer-desktop.module.css';

export interface PageFooterDesktopProps {
  /** Mode-specific first row content (e.g. board pagination or thread controls) */
  firstRow: React.ReactNode;
}

const PageFooterDesktop = ({ firstRow }: PageFooterDesktopProps) => {
  return (
    <footer className={styles.footer}>
      <hr />
      <div className={styles.firstRow}>{firstRow}</div>
      <div className={styles.boardsBarRow}>
        <BoardsBar />
      </div>
      <div className={styles.legalMeta}>
        <SiteLegalMeta order='license-first' />
      </div>
    </footer>
  );
};

export default PageFooterDesktop;
