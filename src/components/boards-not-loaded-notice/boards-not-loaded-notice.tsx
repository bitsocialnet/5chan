import { useTranslation } from 'react-i18next';
import { useDirectories } from '../../hooks/use-directories';
import { getBoardPath } from '../../lib/utils/route-utils';

/** Names the boards a sorted multiboard catalog was taken without, because they had not loaded in time. */
const BoardsNotLoadedNotice = ({ communityAddresses }: { communityAddresses: readonly string[] }) => {
  const { t } = useTranslation();
  const directories = useDirectories();

  if (communityAddresses.length === 0) {
    return null;
  }

  const boards = communityAddresses.map((address) => `/${getBoardPath({ address: address, communities: directories })}/`).join(', ');
  return <div>{t('boards_not_loaded', { boards, interpolation: { escapeValue: false } })}</div>;
};

export default BoardsNotLoadedNotice;
