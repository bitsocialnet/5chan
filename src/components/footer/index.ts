export {
  PageFooterDesktop,
  PageFooterMobile,
  StyleOnlyFooterFirstRow,
  CatalogFooterFirstRow,
  CatalogFooterStyleRow,
  ThreadFooterFirstRow,
  ThreadFooterStyleRow,
  ThreadFooterMobile,
} from './footer';
// Shared footer layout classes (mobileFooterButtons, mobileFooterPagination, footerRow, ...) used by views
// that render their own footer rows; import { footerStyles } instead of reaching for footer.module.css.
export { default as footerStyles } from './footer.module.css';
