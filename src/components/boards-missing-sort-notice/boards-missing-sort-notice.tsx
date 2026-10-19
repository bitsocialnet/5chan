import { useTranslation } from 'react-i18next';
import { useBoardsMissingSortType } from '../../hooks/use-board-sort-type';
import { useDirectories } from '../../hooks/use-directories';
import { BUMP_ORDER_SORT_TYPE } from '../../lib/utils/board-sort-utils';
import { getBoardPath } from '../../lib/utils/route-utils';

/** Names the boards a multiboard bump-order feed cannot include, which would otherwise be left out silently. */
const BoardsMissingSortNotice = ({ communityAddresses }: { communityAddresses: readonly string[] }) => {
  const { t } = useTranslation();
  const directories = useDirectories();
  const missingAddresses = useBoardsMissingSortType(communityAddresses, BUMP_ORDER_SORT_TYPE);

  if (missingAddresses.length === 0) {
    return null;
  }

  const boards = missingAddresses.map((address) => `/${getBoardPath({ address: address, communities: directories })}/`).join(', ');
  return <div>{t('boards_without_bump_order', { boards, interpolation: { escapeValue: false } })}</div>;
};

export default BoardsMissingSortNotice;
