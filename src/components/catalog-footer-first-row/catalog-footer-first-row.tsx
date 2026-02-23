import { useTranslation } from 'react-i18next';
import StyleSelector from '../style-selector/style-selector';
import styles from '../footer-first-row/footer-first-row.module.css';

/** Catalog footer first row: Style selector on right only (no pagination; catalog shows all pages at once). */
const CatalogFooterFirstRow = () => {
  const { t } = useTranslation();

  return (
    <div className={styles.footerRow}>
      <div className={styles.footerLeft} />
      <div className={styles.footerRight}>
        <span className={styles.styleLabel}>{t('style')}:</span>
        <StyleSelector />
      </div>
    </div>
  );
};

export default CatalogFooterFirstRow;
