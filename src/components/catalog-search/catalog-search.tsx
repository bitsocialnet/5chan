import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './catalog-search.module.css';
import useIsMobile from '../../hooks/use-is-mobile';
import useCatalogFiltersStore from '../../stores/use-catalog-filters-store';
import { debounce } from 'lodash';

const CatalogSearch = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [openSearch, setOpenSearch] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { setSearchFilter, clearSearchFilter } = useCatalogFiltersStore();

  // Extract query parameter from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const queryParam = urlParams.get('q');
    if (queryParam) {
      setInputValue(queryParam);
      setSearchFilter(queryParam);
      setOpenSearch(true);
    }
  }, [location.search, setSearchFilter]);

  // Update URL when search changes
  const updateURL = useCallback(
    (searchText: string) => {
      const urlParams = new URLSearchParams(location.search);
      if (searchText.trim()) {
        urlParams.set('q', searchText);
      } else {
        urlParams.delete('q');
      }
      const newSearch = urlParams.toString();
      const newPath = location.pathname + (newSearch ? `?${newSearch}` : '');
      navigate(newPath, { replace: true });
    },
    [location.pathname, location.search, navigate],
  );

  // Create a debounced version of setSearchFilter and URL update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetSearchFilter = useCallback(
    debounce((text: string) => {
      if (text.trim()) {
        setSearchFilter(text);
        updateURL(text);
      } else {
        clearSearchFilter();
        updateURL('');
      }
    }, 300),
    [setSearchFilter, clearSearchFilter, updateURL],
  );

  const handleToggleSearch = useCallback(() => {
    setOpenSearch((prev) => !prev);

    if (openSearch) {
      setInputValue('');
      clearSearchFilter();
      updateURL('');
    }
  }, [openSearch, clearSearchFilter, updateURL]);

  const handleCloseSearch = useCallback(() => {
    setOpenSearch(false);
    setInputValue('');
    clearSearchFilter();
    updateURL('');
  }, [clearSearchFilter, updateURL]);

  useEffect(() => {
    if (openSearch) {
      const input = document.querySelector('input');
      input?.focus();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          handleCloseSearch();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [openSearch, handleCloseSearch]);

  useEffect(() => {
    debouncedSetSearchFilter(inputValue);

    return () => {
      debouncedSetSearchFilter.cancel();
    };
  }, [inputValue, debouncedSetSearchFilter]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const isMobile = useIsMobile();

  return (
    <>
      {!isMobile && '['}
      <span className={`${styles.filtersButton} button`} onClick={handleToggleSearch}>
        {t('search')}
      </span>
      {!isMobile && ']'}
      {openSearch && (
        <div className={styles.searchContainer}>
          <input type='text' value={inputValue} onChange={handleSearchChange} />
          <span className={styles.closeSearch} onClick={handleCloseSearch}>
            ✖
          </span>
        </div>
      )}
    </>
  );
};

export default CatalogSearch;
