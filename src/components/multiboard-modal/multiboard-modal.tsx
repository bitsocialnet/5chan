import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActiveAccountField } from '../../hooks/use-active-account-field';
import { useDirectories, type DirectoryCommunity } from '../../hooks/use-directories';
import { useBoardCategoryFromSearch, useSavedMultiboards } from '../../hooks/use-saved-multiboards';
import {
  BOARD_CATEGORIES,
  filterByBoardCategory,
  getBoardCategoryBoards,
  getBoardListEntryLabel,
  getCustomBoardCategory,
  getSavedMultiboardSlug,
  getSearchWithBoardCategory,
  parseBoardList,
} from '../../lib/utils/board-category-utils';
import { getBoardNameFromDirectoryTitle, getDirectoryCode } from '../../lib/utils/route-utils';
import { createMultiboard, deleteMultiboard, MAX_MULTIBOARD_NAME_LENGTH, setMultiboardHasBoard, updateMultiboard } from '../../lib/utils/saved-multiboards';
import { isAllView } from '../../lib/utils/view-utils';
import useMultiboardModalStore, { type MultiboardModal as MultiboardModalState } from '../../stores/use-multiboard-modal-store';
import styles from './multiboard-modal.module.css';

interface PickerBoard {
  /** A directory code or a board address, as a multiboard stores it. */
  value: string;
  name: string;
  title: string;
}

interface PickerGroup {
  name: string;
  nsfw?: boolean;
  boards: PickerBoard[];
}

const EMPTY_ADDRESSES: string[] = [];

const toCodeBoards = (directories: DirectoryCommunity[]): PickerBoard[] => {
  const boards = new Map<string, PickerBoard>();
  for (const directory of directories) {
    const code = getDirectoryCode(directory);
    if (code && !boards.has(code)) {
      boards.set(code, { value: code, name: directory.title ? getBoardNameFromDirectoryTitle(directory.title) : `/${code}/`, title: `/${code}/` });
    }
  }
  return [...boards.values()];
};

// The home page headings, then directories published to bitsocialnet/lists after those headings were written,
// then boards outside the directories: the multiboard's own and the account's subscriptions.
const getPickerGroups = (directories: DirectoryCommunity[], addresses: string[]): PickerGroup[] => {
  const categorizedCodes = new Set(BOARD_CATEGORIES.flatMap((category) => category.directoryCodes));
  const uncategorized = directories.filter((directory) => {
    const code = getDirectoryCode(directory);
    return code !== null && !categorizedCodes.has(code);
  });
  const directoryAddresses = new Set(directories.map((directory) => directory.address));
  const otherBoards = addresses
    .filter((address) => !directoryAddresses.has(address))
    .map((address) => ({ value: address, name: getBoardListEntryLabel(address), title: address }));
  return [
    ...BOARD_CATEGORIES.map((category) => ({
      name: category.name,
      nsfw: category.nsfw,
      boards: toCodeBoards(filterByBoardCategory(directories, category, getDirectoryCode)),
    })),
    { name: 'More Boards', boards: toCodeBoards(uncategorized) },
    { name: 'Other Boards', boards: otherBoards },
  ].filter((group) => group.boards.length > 0);
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const MultiboardEditor = ({ multiboardId, boards, onClose }: { multiboardId?: string; boards?: string[]; onClose: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const directories = useDirectories();
  const savedMultiboards = useSavedMultiboards();
  const subscriptions = useActiveAccountField((account) => account?.subscriptions as string[] | undefined) ?? EMPTY_ADDRESSES;
  const currentCategory = useBoardCategoryFromSearch(location.search);
  const editing = multiboardId ? savedMultiboards.find((multiboard) => multiboard.id === multiboardId) : undefined;
  // Start from the given boards, the saved multiboard, or the multiboard being read, so a category can be trimmed.
  const [initialBoards] = useState(() => boards ?? editing?.boards ?? (currentCategory ? getBoardCategoryBoards(currentCategory) : []));
  const [selectedBoards, setSelectedBoards] = useState(() => new Set(initialBoards));
  const [name, setName] = useState(() => editing?.name ?? '');
  const [status, setStatus] = useState<{ saving: boolean; error?: string }>({ saving: false });
  const groups = useMemo(
    () => getPickerGroups(directories, [...new Set([...parseBoardList(initialBoards.join(',')).addresses, ...subscriptions])]),
    [directories, initialBoards, subscriptions],
  );

  // Listing order, not click order, so the same boards always make the same link. Boards in the starting list
  // that are not listed (a typo, or a category's boards that have no directory yet) are dropped here.
  const pickedBoards = groups.flatMap((group) => group.boards.map((board) => board.value)).filter((board) => selectedBoards.has(board));
  const trimmedName = name.trim();

  const toggleBoard = (board: string, checked: boolean) => {
    setSelectedBoards((selected) => {
      const next = new Set(selected);
      if (checked) next.add(board);
      else next.delete(board);
      return next;
    });
  };

  // Opened from a board page (Add to Multiboard), the page stays; from /all, it shows the result.
  const showInAll = (slug: string | undefined) => {
    if (!isAllView(location.pathname)) return;
    navigate({ pathname: location.pathname, search: getSearchWithBoardCategory(location.search, slug) });
  };

  const showUnsaved = () => {
    const category = getCustomBoardCategory(parseBoardList(pickedBoards.join(',')));
    if (!category) return;
    navigate({ pathname: isAllView(location.pathname) ? location.pathname : '/all', search: getSearchWithBoardCategory(location.search, category.slug) });
    onClose();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedName || pickedBoards.length === 0 || status.saving) return;
    setStatus({ saving: true });
    try {
      let id = editing?.id;
      if (id) await updateMultiboard(id, { name: trimmedName, boards: pickedBoards });
      else id = await createMultiboard(trimmedName, pickedBoards);
      showInAll(getSavedMultiboardSlug(id));
      onClose();
    } catch (error) {
      setStatus({ saving: false, error: `Could not save the multiboard: ${getErrorMessage(error)}` });
    }
  };

  const remove = async () => {
    if (!editing || status.saving || !window.confirm(`Delete the multiboard "${editing.name}"?`)) return;
    setStatus({ saving: true });
    try {
      await deleteMultiboard(editing.id);
      if (currentCategory?.savedId === editing.id) showInAll(undefined);
      onClose();
    } catch (error) {
      setStatus({ saving: false, error: `Could not delete the multiboard: ${getErrorMessage(error)}` });
    }
  };

  return (
    <form onSubmit={save}>
      <p className={styles.hint}>
        {editing ? 'Change the name or the boards of this multiboard.' : 'Pick boards to read as one feed. Name it to save it with your account.'}
      </p>
      <div className={styles.nameRow}>
        <label htmlFor='multiboard-name'>Name</label>
        <input
          id='multiboard-name'
          type='text'
          className={styles.nameInput}
          maxLength={MAX_MULTIBOARD_NAME_LENGTH}
          placeholder='Example: Tech'
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {groups.map((group) => (
        <fieldset key={group.name} className={styles.group}>
          <legend>
            {group.name}
            {group.nsfw && <sup className={styles.nsfw}> (NSFW)</sup>}
          </legend>
          {group.boards.map((board) => {
            const id = `multiboard-board-${board.value}`;
            return (
              <span key={board.value} className={styles.board}>
                <input type='checkbox' id={id} checked={selectedBoards.has(board.value)} onChange={(event) => toggleBoard(board.value, event.target.checked)} />
                <label htmlFor={id} title={board.title}>
                  {board.name}
                </label>
              </span>
            );
          })}
        </fieldset>
      ))}
      {status.error && <p className={`red ${styles.error}`}>{status.error}</p>}
      <div className={styles.footer}>
        {!editing && (
          <button type='button' disabled={pickedBoards.length === 0} onClick={showUnsaved}>
            Show
          </button>
        )}{' '}
        <button type='submit' disabled={!trimmedName || pickedBoards.length === 0 || status.saving}>
          Save
        </button>
        {editing && (
          <>
            {' '}
            <button type='button' disabled={status.saving} onClick={remove}>
              Delete
            </button>
          </>
        )}
      </div>
    </form>
  );
};

const AddToMultiboard = ({ board, boardLabel, onClose }: { board: string; boardLabel: string; onClose: () => void }) => {
  const savedMultiboards = useSavedMultiboards();
  const openMultiboardEditor = useMultiboardModalStore((state) => state.openMultiboardEditor);
  const [error, setError] = useState<string>();

  const toggle = (id: string, hasBoard: boolean) => {
    setError(undefined);
    setMultiboardHasBoard(id, board, hasBoard).catch((reason: unknown) => setError(`Could not change the multiboard: ${getErrorMessage(reason)}`));
  };

  return (
    <>
      <p className={styles.hint}>{savedMultiboards.length > 0 ? `Show ${boardLabel} in:` : 'You have no multiboards yet.'}</p>
      {savedMultiboards.length > 0 && (
        <ul className={styles.list}>
          {savedMultiboards.map((multiboard) => {
            const id = `multiboard-add-${multiboard.id}`;
            return (
              <li key={multiboard.id}>
                <input type='checkbox' id={id} checked={multiboard.boards.includes(board)} onChange={(event) => toggle(multiboard.id, event.target.checked)} />
                <label htmlFor={id}>{multiboard.name}</label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className={`red ${styles.error}`}>{error}</p>}
      <div className={styles.footer}>
        <button type='button' onClick={() => openMultiboardEditor({ boards: [board] })}>
          New Multiboard…
        </button>{' '}
        <button type='button' onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );
};

const getModalTitle = (modal: MultiboardModalState) => {
  if (modal.kind === 'add') return `Add ${modal.boardLabel} to a Multiboard`;
  return modal.multiboardId ? 'Edit Multiboard' : 'New Multiboard';
};

// The opener (a select, [Edit] or [Add to Multiboard]) sits behind the dialog, so take focus on open: keyboard
// users land in the dialog and Escape reaches its handler. Module-level so it runs once per mounted dialog.
const focusOnOpen = (dialog: HTMLDialogElement | null) => dialog?.focus();

const MultiboardModal = () => {
  const modal = useMultiboardModalStore((state) => state.modal);
  const closeMultiboardModal = useMultiboardModalStore((state) => state.closeMultiboardModal);

  if (!modal) {
    return null;
  }

  // A new key per view, so switching from the add list to a new multiboard starts the editor afresh.
  const modalKey = modal.kind === 'add' ? `add-${modal.board}` : `editor-${modal.multiboardId ?? ''}-${modal.boards?.join(',') ?? ''}`;

  return (
    <div className={styles.backdrop}>
      <button type='button' className={styles.backdropButton} aria-label='Close multiboard modal' onClick={closeMultiboardModal} />
      <dialog
        key={modalKey}
        open
        ref={focusOnOpen}
        tabIndex={-1}
        className={styles.dialog}
        aria-modal='true'
        aria-labelledby='multiboard-modal-title'
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeMultiboardModal();
        }}
      >
        <div className={styles.hd}>
          <h2 id='multiboard-modal-title'>{getModalTitle(modal)}</h2>
          <button type='button' className={styles.closeButton} onClick={closeMultiboardModal} title='Close' aria-label='Close' />
        </div>
        <div className={styles.bd}>
          {modal.kind === 'add' ? (
            <AddToMultiboard board={modal.board} boardLabel={modal.boardLabel} onClose={closeMultiboardModal} />
          ) : (
            <MultiboardEditor multiboardId={modal.multiboardId} boards={modal.boards} onClose={closeMultiboardModal} />
          )}
        </div>
      </dialog>
    </div>
  );
};

export default MultiboardModal;
