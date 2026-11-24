import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDirectories, type DirectoryCommunity } from '../../hooks/use-directories';
import {
  BOARD_CATEGORIES,
  filterByBoardCategory,
  getBoardCategoryFromSearch,
  getCustomBoardCategory,
  getSearchWithBoardCategory,
} from '../../lib/utils/board-category-utils';
import { getBoardNameFromDirectoryTitle, getDirectoryCode } from '../../lib/utils/route-utils';
import { isAllView } from '../../lib/utils/view-utils';
import useCustomMultiboardModalStore from '../../stores/use-custom-multiboard-modal-store';
import styles from './custom-multiboard-modal.module.css';

interface PickerBoard {
  code: string;
  name: string;
}

interface PickerGroup {
  name: string;
  nsfw?: boolean;
  boards: PickerBoard[];
}

const toPickerBoards = (directories: DirectoryCommunity[]): PickerBoard[] => {
  const boards = new Map<string, PickerBoard>();
  for (const directory of directories) {
    const code = getDirectoryCode(directory);
    if (code && !boards.has(code)) {
      boards.set(code, { code, name: directory.title ? getBoardNameFromDirectoryTitle(directory.title) : `/${code}/` });
    }
  }
  return [...boards.values()];
};

// The home page headings, then any directory published to bitsocialnet/lists after those headings were written.
const getPickerGroups = (directories: DirectoryCommunity[]): PickerGroup[] => {
  const categorizedCodes = new Set(BOARD_CATEGORIES.flatMap((category) => category.directoryCodes));
  const uncategorized = directories.filter((directory) => {
    const code = getDirectoryCode(directory);
    return code !== null && !categorizedCodes.has(code);
  });
  return [
    ...BOARD_CATEGORIES.map((category) => ({
      name: category.name,
      nsfw: category.nsfw,
      boards: toPickerBoards(filterByBoardCategory(directories, category, getDirectoryCode)),
    })),
    { name: 'More Boards', boards: toPickerBoards(uncategorized) },
  ].filter((group) => group.boards.length > 0);
};

const CustomMultiboardForm = ({ onClose }: { onClose: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const directories = useDirectories();
  const groups = useMemo(() => getPickerGroups(directories), [directories]);
  // Start from the multiboard being read, so a category can be trimmed or a custom list edited.
  const [selectedCodes, setSelectedCodes] = useState(() => new Set(getBoardCategoryFromSearch(location.search)?.directoryCodes));

  const toggleCode = (code: string, checked: boolean) => {
    setSelectedCodes((codes) => {
      const nextCodes = new Set(codes);
      if (checked) nextCodes.add(code);
      else nextCodes.delete(code);
      return nextCodes;
    });
  };

  // Listing order, not click order, so the same boards always make the same link. Codes in the URL with no
  // listed board (a typo, or a category's boards that have no directory yet) are dropped here.
  const pickedCodes = groups.flatMap((group) => group.boards.map((board) => board.code)).filter((code) => selectedCodes.has(code));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const category = getCustomBoardCategory(pickedCodes);
    if (!category) return;
    navigate({
      pathname: isAllView(location.pathname) ? location.pathname : '/all',
      search: getSearchWithBoardCategory(location.search, category.slug),
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className={styles.hint}>Pick boards to read as one feed, then bookmark the page.</p>
      {groups.map((group) => (
        <fieldset key={group.name} className={styles.group}>
          <legend>
            {group.name}
            {group.nsfw && <sup className={styles.nsfw}> (NSFW)</sup>}
          </legend>
          {group.boards.map((board) => {
            const id = `custom-multiboard-${board.code}`;
            return (
              <span key={board.code} className={styles.board}>
                <input type='checkbox' id={id} checked={selectedCodes.has(board.code)} onChange={(event) => toggleCode(board.code, event.target.checked)} />
                <label htmlFor={id} title={`/${board.code}/`}>
                  {board.name}
                </label>
              </span>
            );
          })}
        </fieldset>
      ))}
      <div className={styles.footer}>
        <button type='submit' disabled={pickedCodes.length === 0}>
          Show
        </button>
      </div>
    </form>
  );
};

// The opener (the category select or [Edit]) sits behind the dialog, so take focus on open: keyboard
// users land in the picker and Escape reaches the dialog's handler. Module-level so it runs once per open.
const focusOnOpen = (dialog: HTMLDialogElement | null) => dialog?.focus();

const CustomMultiboardModal = () => {
  const showModal = useCustomMultiboardModalStore((state) => state.showModal);
  const closeCustomMultiboardModal = useCustomMultiboardModalStore((state) => state.closeCustomMultiboardModal);

  if (!showModal) {
    return null;
  }

  return (
    <div className={styles.backdrop}>
      <button type='button' className={styles.backdropButton} aria-label='Close custom multiboard modal' onClick={closeCustomMultiboardModal} />
      <dialog
        open
        ref={focusOnOpen}
        tabIndex={-1}
        className={styles.dialog}
        aria-modal='true'
        aria-labelledby='custom-multiboard-modal-title'
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeCustomMultiboardModal();
        }}
      >
        <div className={styles.hd}>
          <h2 id='custom-multiboard-modal-title'>Custom Multiboard</h2>
          <button type='button' className={styles.closeButton} onClick={closeCustomMultiboardModal} title='Close' aria-label='Close' />
        </div>
        <div className={styles.bd}>
          <CustomMultiboardForm onClose={closeCustomMultiboardModal} />
        </div>
      </dialog>
    </div>
  );
};

export default CustomMultiboardModal;
